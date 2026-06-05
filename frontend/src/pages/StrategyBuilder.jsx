import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { LabRunHero } from "@/components/lab/LabRunHero";
import { NeonPanel, SectionTitle } from "@/components/lab/NeonPanel";
import { Field, NeonInput, NeonSelect, Segment, NeonToggle, NeonButton } from "@/components/lab/controls";
import { HelpCircle, Play, Save, FileInput, Copy, ShieldAlert, Trash2, Check, ChevronDown, ChevronUp, FolderPlus } from "lucide-react";
import { usePresets } from "@/data/presets";
import { Pill } from "@/components/lab/DataTable";
import { cancelSidecarRun, getSidecarRun, getSidecarRunBundle, startSidecarRun } from "@/data/sidecarClient";
import { ingestRunBundle } from "@/data/importer";
import {
    addRunBundle,
    assignRunToProject,
    createResearchProject,
    getRunDisplayName,
    getUniqueRunDisplayName,
    setActiveProjectId,
    useDataset,
} from "@/data/store";
import {
    buildBacktesterConfig,
    buildRunConfigLoadReport,
    selectedAllowedSessions,
    resolveEntryExportMode,
    entryExportFullRangeWarning,
    buildAllowedStructureDirections,
    mapConfigDirection,
    mapConfigDetectionTf,
    mapConfigExecutionTf,
    mapConfigExecutionMode,
    toNumber,
    normalizeDateValue,
    ensureArray,
} from "@/data/configTranslator";

const LAST_CONFIG_KEY = "fxob_strategy_builder_last_config";
const LAST_RUN_KEY = "fxob_strategy_builder_last_run";

function getDefaultDates() {
    // TODO: replace DATASET_MAX_DATE with actual max candle timestamp from dataset metadata
    // once the sidecar exposes a /datasets/:file/info endpoint.
    const DATASET_MAX_DATE = "2026-05-18"; // EURUSD_1m.csv coverage ceiling
    const to = new Date(DATASET_MAX_DATE + "T00:00:00Z");
    const from = new Date(to);
    from.setUTCMonth(from.getUTCMonth() - 3);
    return { dateFrom: from.toISOString().slice(0, 10), dateTo: DATASET_MAX_DATE };
}

export default function StrategyBuilder() {
    const { PROJECTS, ACTIVE_PROJECT, RUNS, activeProjectId, getRunData } = useDataset();
    const [cfg, setCfg] = useState(() => {
        const { dateFrom, dateTo } = getDefaultDates();
        return {
        symbol: "EURUSD",
        detectionTf: "M15",
        executionTf: "1m",
        dateFrom,
        dateTo,
        dataFile: "data/candles/EURUSD_1m.csv",
        swing: 50,
        obFilter: "ATR",
        minObSizePips: 0,
        maxObSizePips: 100,
        structure: "Both",
        direction: "Both",
        bosLong: true,
        bosShort: true,
        chochLong: true,
        chochShort: true,
        rr: 3.3,
        obEntryDepthPct: 0,
        entryBuffer: 0.0,
        stopBuffer: 1.0,
        verifyTicks: 0,
        executionMode: "multi_position",
        conflict: "Allow Auto Reversal",
        cancelAction: "Kill OB",
        sessionFilter: true,
        london: true, lull: true, newYork: true, asia: true, outside: true,
        originSession: "Any",
        detectionSession: "Any",
        newsBlackout: true,
        newsFile: "data/news/master_economic_calendar_2020_present.csv",
        newsBlackoutBefore: 5,
        newsBlackoutAfter: 5,
        newsBlackoutImpacts: ["high"],
        newsBlackoutCurrencies: [],
        newsPausePending: true,
        newsBlockFills: true,
        newsCancelIfTouched: true,
        newsFlattenActiveTrades: true,
        newsFlattenMinutesBefore: 5,
        newsDebugObIds: "",
        spread: 0.2,
        slippage: 0.2,
        commission: 0,
        entryResearchExportMode: "light",
        entryResearchExports: true,
        entryPenetrationThresholds: "25,50",
        useBatchedEntryPenetration: true,
        triggeredEdgeEntries: false,
        triggeredEdgeThresholds: "25",
        triggeredEdgeEntryLevelPct: 0,
        triggeredEdgeSameCandleMode: "both",
        triggeredEdgeDelays: [0, 1],
        triggeredEdgeCancelOnRetrace: false,
        triggeredEdgeCancelOnFirstFailedTag: false,
        triggeredEdgeFftMoveAwayPips: 0,
        triggeredEdgeFftMoveAwayObMultiple: 0,
        triggeredEdgeCancelRetracePips: 0,
        triggeredEdgeCancelRetraceObPct: 0,
        entryMode: "single",
        selectedEntryModel: "baseline",
        singlePenetrationPct: 25,
        singleTriggeredEdgeThreshold: 25,
        // ── Directional entry assignment (Phase 2 config foundation) ──────
        directionalEntryMode: "symmetric",
        longEntryEnabled: true,
        longEntryModel: "triggered_edge",
        longPenetrationPct: 25,
        longTriggeredEdgeThreshold: 25,
        longTriggeredEdgeDelays: [0, 1],
        shortEntryEnabled: true,
        shortEntryModel: "triggered_edge",
        shortPenetrationPct: 25,
        shortTriggeredEdgeThreshold: 25,
        shortTriggeredEdgeDelays: [0, 1],
        monteCarlo: false,
        };
    });
    const set = (k) => (v) => setCfg((c) => ({ ...c, [k]: v }));

    // ── Preset manager (localStorage: fxob_configs) ─────────────────
    const { presets, save, remove, duplicate, load, names } = usePresets();
    const [selectedPreset, setSelectedPreset] = useState("");
    const [presetName, setPresetName] = useState("");
    const [flash, setFlash] = useState("");
    const [showConfig, setShowConfig] = useState(false);
    const [runJob, setRunJob] = useState(null);
    const [runError, setRunError] = useState("");
    const [runBusy, setRunBusy] = useState(false);
    const [importBusy, setImportBusy] = useState(false);
    const [importError, setImportError] = useState("");
    const [importedRunId, setImportedRunId] = useState("");
    const [loadRunId, setLoadRunId] = useState("");
    const [loadedRunId, setLoadedRunId] = useState("");
    const [loadReport, setLoadReport] = useState(null);
    const [loadOtherOpen, setLoadOtherOpen] = useState(false);
    const [lastConfig, setLastConfig] = useState(() => readStoredJson(LAST_CONFIG_KEY));
    const [lastRun, setLastRun] = useState(() => readStoredJson(LAST_RUN_KEY));
    const [activeBuilderCard, setActiveBuilderCard] = useState("");
    const didHydrateConfig = useRef(false);
    const showFlash = (msg) => { setFlash(msg); setTimeout(() => setFlash(""), 1800); };
    const sidecarConfig = useMemo(() => buildBacktesterConfig(cfg), [cfg]);
    const allowedSessions = useMemo(() => selectedAllowedSessions(cfg), [cfg]);
    const sessionSelectionWarning = Boolean(cfg.sessionFilter) && allowedSessions.length === 0;
    const showEntryProtection =
        (cfg.directionalEntryMode === "symmetric" && cfg.selectedEntryModel === "triggered_edge") ||
        (cfg.directionalEntryMode === "asymmetric" && (
            (cfg.longEntryEnabled && cfg.longEntryModel === "triggered_edge") ||
            (cfg.shortEntryEnabled && cfg.shortEntryModel === "triggered_edge")
        )) ||
        Boolean(cfg.triggeredEdgeEntries);
    const sanityConfig = sidecarConfig || lastConfig || {};
    const sanityRun = runJob ? reduceRunSnapshot(runJob, importedRunId) : (lastRun || {});
    const generatedPlan = useMemo(() => estimateScenarioPlan(sidecarConfig), [sidecarConfig]);
    const runInProgress = ["queued", "running"].includes(runJob?.status);
    const selectedLoadRun = loadRunId ? getRunData(loadRunId) : null;
    const selectedLoadProject = selectedLoadRun?.projectId
        ? PROJECTS.find((project) => project.id === selectedLoadRun.projectId)
        : null;
    const mostRecentRun = useMemo(() => {
        const first = RUNS[0];
        if (!first) return null;
        return getRunData(first._bundleId || first.id) || first;
    }, [RUNS, getRunData]);
    const lastRunPreview = useMemo(() => runConfigPreview(mostRecentRun), [mostRecentRun]);
    const selectedLoadPreview = useMemo(() => runConfigPreview(selectedLoadRun), [selectedLoadRun]);

    useEffect(() => {
        if (!runJob?.job_id || !runInProgress) return undefined;
        const timer = window.setInterval(async () => {
            try {
                const next = await getSidecarRun(runJob.job_id);
                setRunJob(next);
                setRunError("");
            } catch (error) {
                setRunError(formatSidecarError(error));
            }
        }, 2000);
        return () => window.clearInterval(timer);
    }, [runJob?.job_id, runInProgress]);

    useEffect(() => {
        if (!didHydrateConfig.current) {
            didHydrateConfig.current = true;
            return;
        }
        writeStoredJson(LAST_CONFIG_KEY, sidecarConfig);
        setLastConfig(sidecarConfig);
    }, [sidecarConfig]);

    useEffect(() => {
        if (!runJob) return;
        const snapshot = reduceRunSnapshot(runJob, importedRunId);
        writeStoredJson(LAST_RUN_KEY, snapshot);
        setLastRun(snapshot);
    }, [runJob, importedRunId]);

    const onSave = () => {
        const name = (presetName || selectedPreset || `${cfg.symbol}_${cfg.detectionTf}_RR${cfg.rr}`).trim();
        if (!name) return;
        save(name, cfg);
        setSelectedPreset(name);
        setPresetName("");
        showFlash(`Saved · ${name}`);
    };
    const onLoad = () => {
        if (!selectedPreset) return;
        const p = load(selectedPreset);
        if (!p) return;
        const { _savedAt, ...rest } = p;
        setCfg((c) => ({ ...c, ...rest }));
        showFlash(`Loaded · ${selectedPreset}`);
    };
    const onDup = () => {
        if (!selectedPreset) return;
        const newName = duplicate(selectedPreset);
        if (newName) { setSelectedPreset(newName); showFlash(`Duplicated → ${newName}`); }
    };
    const onDelete = () => {
        if (!selectedPreset) return;
        remove(selectedPreset);
        showFlash(`Deleted · ${selectedPreset}`);
        setSelectedPreset("");
    };
    const onCreateProject = () => {
        const project = createResearchProject({
            name: `${cfg.symbol} ${cfg.detectionTf} Research`,
            symbol: cfg.symbol,
            timeframe: cfg.detectionTf,
        });
        if (project?.id) setActiveProjectId(project.id);
        showFlash(`Project created · ${project.name}`);
    };
    const applyRunConfig = (run) => {
        if (!run) return;
        const report = buildRunConfigLoadReport(cfg, run);
        setCfg(report.config);
        setLoadedRunId(run.id);
        setLoadReport(report);
        showFlash(`Loaded settings from ${getRunDisplayName(run)}`);
    };
    const onLoadFromRun = () => applyRunConfig(selectedLoadRun);
    const onRunLocal = async () => {
        if (sessionSelectionWarning) {
            setRunError("Select at least one session or disable session filtering.");
            return;
        }
        writeStoredJson(LAST_CONFIG_KEY, sidecarConfig);
        setLastConfig(sidecarConfig);
        setRunBusy(true);
        setRunError("");
        setImportError("");
        setImportedRunId("");
        try {
            // Strip underscore-prefixed metadata keys (_entry_mode, _selected_entry_model, …)
            // before submission — they are frontend-only round-trip helpers and are not
            // recognised by the backtester config schema.  sidecarConfig itself is left
            // intact so localStorage persistence and Master Controls can still read them.
            const sidecarPayload = Object.fromEntries(
                Object.entries(sidecarConfig).filter(([k]) => !k.startsWith("_"))
            );
            const started = await startSidecarRun(sidecarPayload);
            setRunJob(started);
        } catch (error) {
            setRunError(formatSidecarError(error));
        } finally {
            setRunBusy(false);
        }
    };
    const onCancelRun = async () => {
        const runId = runJob?.run_id || runJob?.job_id;
        if (!runId) return;
        setRunBusy(true);
        setRunError("");
        try {
            const cancelled = await cancelSidecarRun(runId);
            setRunJob(cancelled);
        } catch (error) {
            setRunError(formatSidecarError(error));
        } finally {
            setRunBusy(false);
        }
    };
    const onImportCompletedRun = async () => {
        if (!runJob?.job_id) return;
        setImportBusy(true);
        setImportError("");
        setImportedRunId("");
        try {
            const payload = await getSidecarRunBundle(runJob.job_id);
            const files = (payload.files || []).map((file) => (
                new File([file.content || ""], file.name, { type: "text/plain" })
            ));
            const result = await ingestRunBundle(files);
            if (!result.ok) {
                const messages = [
                    ...(result.validationErrors || []).map((e) => e.message || String(e)),
                    ...(result.errors || []).map((e) => e.error || String(e)),
                ].filter(Boolean);
                throw new Error(messages[0] || "Completed run bundle could not be imported.");
            }
            const baseDisplayName = result.bundle.displayName
                || result.bundle.name
                || result.bundle.summary?.displayName
                || result.bundle.summary?.name
                || getRunDisplayName(result.bundle);
            const displayName = getUniqueRunDisplayName(baseDisplayName);
            result.bundle.displayName = displayName;
            result.bundle.name = displayName;
            result.bundle.source = "sidecar";
            result.bundle.sidecarJobId = runJob.job_id;
            result.bundle.outputFolder = payload.folder || runJob.output_folder || "";
            const projectId = activeProjectId || null;
            const runRole = projectId && !ACTIVE_PROJECT?.baselineRunId ? "baseline" : "variant";
            const experimentType = "manual";
            if (projectId) {
                result.bundle.projectId = projectId;
                result.bundle.runRole = runRole;
                result.bundle.experimentType = experimentType;
            }
            result.bundle.summary = {
                ...result.bundle.summary,
                displayName,
                name: displayName,
                source: "sidecar",
                sidecarJobId: runJob.job_id,
                outputFolder: payload.folder || runJob.output_folder || "",
                ...(projectId ? { projectId, runRole, experimentType } : {}),
            };
            const storedBundle = addRunBundle(result.bundle) || result.bundle;
            if (projectId) {
                assignRunToProject(storedBundle.id, projectId, { runRole, experimentType });
            }
            setImportedRunId(storedBundle.id);
        } catch (error) {
            setImportError(formatSidecarError(error));
        } finally {
            setImportBusy(false);
        }
    };
    const onCopyGeneratedConfig = () => copyJsonToClipboard(sanityConfig, showFlash, "Copied generated config");
    const onCopyLastRun = () => copyJsonToClipboard(sanityRun, showFlash, "Copied last run JSON");
    const toggleNewsImpact = (impact) => {
        setCfg((current) => {
            const existing = Array.isArray(current.newsBlackoutImpacts) ? current.newsBlackoutImpacts : [];
            const next = existing.includes(impact)
                ? existing.filter((item) => item !== impact)
                : [...existing, impact];
            return { ...current, newsBlackoutImpacts: next };
        });
    };

    return (
        <div className="pb-12">
            <LabRunHero
                pageLabel="Strategy Builder"
                title="Create New Backtest"
                description="Configure research parameters. This builder writes config only — execution happens against local Python engine."
                actions={
                    <div className="flex flex-col items-end gap-2">
                        <ConfigScopeRibbon cfg={cfg} />
                        <NeonButton icon={Play} tone="primary" onClick={onRunLocal} disabled={runBusy || runInProgress} data-testid="builder-run-backtest">
                            {runBusy ? "Starting..." : runInProgress ? "Running..." : "Run Backtest Locally"}
                        </NeonButton>
                    </div>
                }
            />

            <div className="px-6 mb-4">
                <div className="clip-bevel p-[1px] bg-gradient-to-r from-[hsl(var(--border-mid))] via-[hsl(var(--accent-secondary)/0.25)] to-[hsl(var(--border-mid))]">
                    <div className="clip-bevel bg-[hsl(var(--panel))] px-4 py-3 flex items-center gap-3 flex-wrap">
                        <div className="min-w-[260px]">
                            <div className="control-label text-[10px] font-ui uppercase tracking-[0.14em] text-muted-lab">
                                {ACTIVE_PROJECT ? "Active Research Project" : "Research Project Required"}
                            </div>
                            <div className={`text-[10.5px] ${ACTIVE_PROJECT ? "text-[hsl(var(--accent-secondary))]" : "text-[hsl(var(--warning))]"}`}>
                                {ACTIVE_PROJECT
                                    ? `Active Project: ${ACTIVE_PROJECT.name}`
                                    : "Create or select a Research Project before running a backtest."}
                            </div>
                        </div>
                        <NeonSelect
                            value={activeProjectId || ""}
                            onChange={(value) => setActiveProjectId(value || null)}
                            options={[
                                { value: "", label: "— no active project —" },
                                ...PROJECTS.map((project) => ({ value: project.id, label: project.name })),
                            ]}
                            className="min-w-[260px]"
                        />
                        {!ACTIVE_PROJECT && (
                            <Link to="/projects">
                                <NeonButton tone="ghost">Go to Projects</NeonButton>
                            </Link>
                        )}
                        <NeonButton icon={FolderPlus} tone="secondary" onClick={onCreateProject}>
                            Create from Config
                        </NeonButton>
                        {ACTIVE_PROJECT && (
                            <>
                                <Pill tone="primary">{ACTIVE_PROJECT.runIds?.length || 0} project runs</Pill>
                                <span className="text-[10.5px] text-muted-lab">New local runs attach to this project.</span>
                            </>
                        )}
                    </div>
                </div>
            </div>

            {/* ── Strategy Recall ─────────────────────────────────────── */}
            <div className="px-6 mb-4 flex flex-col gap-2.5">
                {/* A · Primary — Last Run Config */}
                <div className="clip-bevel p-[1px] bg-gradient-to-r from-[hsl(var(--border-mid))] via-[hsl(var(--accent-secondary)/0.28)] to-[hsl(var(--border-mid))]">
                    <div className="clip-bevel bg-[hsl(var(--panel))] px-4 py-3">
                        {lastRunPreview ? (
                            <div className="flex items-center gap-4 flex-wrap">
                                <div className="min-w-[150px]">
                                    <div className="control-label text-[10px] font-ui uppercase tracking-[0.14em] text-muted-lab">Last Run Config</div>
                                    <div className="mt-0.5 text-[12px] font-ui text-[hsl(var(--accent-secondary))] truncate max-w-[240px]">{lastRunPreview.name}</div>
                                    {lastRunPreview.date && <div className="text-[10px] text-muted-lab">{lastRunPreview.date}</div>}
                                </div>
                                <ConfigSnapshot preview={lastRunPreview} className="flex-1 min-w-[220px]" />
                                <NeonButton icon={FileInput} tone="secondary" onClick={() => applyRunConfig(mostRecentRun)}>
                                    Apply Config
                                </NeonButton>
                            </div>
                        ) : (
                            <div>
                                <div className="control-label text-[10px] font-ui uppercase tracking-[0.14em] text-muted-lab">Last Run Config</div>
                                <div className="mt-0.5 text-[10.5px] text-muted-lab">No previous runs yet. Imported or local runs appear here for one-tap recall.</div>
                            </div>
                        )}
                    </div>
                </div>

                {/* B · Secondary — Load Other Run (collapsible) */}
                <div>
                    <button
                        onClick={() => setLoadOtherOpen((v) => !v)}
                        className="flex items-center gap-2 control-label text-[10px] font-ui uppercase tracking-[0.14em] text-muted-lab hover:text-white transition-colors"
                        aria-expanded={loadOtherOpen}
                    >
                        {loadOtherOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                        <span>Load Other Run</span>
                        <span className="text-muted-lab/70 normal-case tracking-normal">· recall config from any previous run</span>
                    </button>
                    {loadOtherOpen && (
                        <div className="mt-2 clip-bevel p-[1px] bg-gradient-to-r from-[hsl(var(--border-mid))] via-[hsl(var(--accent-secondary)/0.16)] to-[hsl(var(--border-mid))]">
                            <div className="clip-bevel bg-[hsl(var(--panel))] px-4 py-3 flex flex-col gap-3">
                                <div className="flex items-center gap-3 flex-wrap">
                                    <NeonSelect
                                        value={loadRunId}
                                        onChange={setLoadRunId}
                                        options={[
                                            { value: "", label: "— select previous run —" },
                                            ...RUNS.map((run) => {
                                                const bundle = getRunData(run._bundleId || run.id) || run;
                                                return { value: bundle.id, label: formatLoadRunLabel(bundle) };
                                            }),
                                        ]}
                                        className="min-w-[340px] flex-1"
                                    />
                                    <NeonButton icon={FileInput} tone="secondary" onClick={onLoadFromRun} disabled={!selectedLoadRun}>
                                        Apply Config
                                    </NeonButton>
                                    {selectedLoadProject && selectedLoadProject.id !== activeProjectId && (
                                        <NeonButton tone="ghost" onClick={() => setActiveProjectId(selectedLoadProject.id)}>
                                            Use This Run&apos;s Project
                                        </NeonButton>
                                    )}
                                    {selectedLoadProject && (
                                        <Pill tone="secondary">Run belongs to: {selectedLoadProject.name}</Pill>
                                    )}
                                </div>
                                {selectedLoadPreview && (
                                    <div className="border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2)/0.3)] clip-bevel-sm px-3 py-2 flex items-center gap-4 flex-wrap">
                                        <div className="min-w-[140px]">
                                            <div className="control-label text-[9.5px] font-ui uppercase tracking-wider text-muted-lab">Config Preview</div>
                                            <div className="mt-0.5 text-[11.5px] font-ui text-[hsl(var(--accent-secondary))] truncate max-w-[220px]">{selectedLoadPreview.name}</div>
                                            {selectedLoadPreview.date && <div className="text-[10px] text-muted-lab">{selectedLoadPreview.date}</div>}
                                        </div>
                                        <ConfigSnapshot preview={selectedLoadPreview} className="flex-1 min-w-[200px]" />
                                    </div>
                                )}
                                {loadedRunId && (
                                    <div className="text-[10.5px] text-[hsl(var(--accent-secondary))]">
                                        Loaded settings from {getRunDisplayName(getRunData(loadedRunId))}. Adjust and run as a new variant.
                                        {loadReport && (
                                            <span className="ml-2 text-muted-lab">
                                                Loaded {loadReport.loadedFields.length} fields · missing {loadReport.missingFields.length}
                                                {loadReport.missingFields.length ? ` (${loadReport.missingFields.join(", ")})` : ""}
                                            </span>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <div className="px-6 grid grid-cols-1 lg:grid-cols-3 gap-4">
                <BuilderFocusCard id="basic" activeId={activeBuilderCard} onActivate={setActiveBuilderCard}>
                <NeonPanel title="Basic Settings" className="flex-1">
                    <div className="grid grid-cols-1 sm:grid-cols-6 gap-3">
                        <Field label="Symbol" className="sm:col-span-2">
                            <NeonSelect testId="bld-symbol" value={cfg.symbol} onChange={set("symbol")} options={["EURUSD", "GBPUSD", "USDJPY", "XAUUSD", "AUDUSD"]} />
                        </Field>
                        <Field label="Detection TF" className="sm:col-span-2">
                            <NeonSelect value={cfg.detectionTf} onChange={set("detectionTf")} options={["M5", "M15", "M30", "H1", "H4"]} />
                        </Field>
                        <Field label="Execution TF" className="sm:col-span-2">
                            <NeonSelect value={cfg.executionTf} onChange={set("executionTf")} options={["1m", "5m"]} />
                        </Field>
                        <Field label="From" className="sm:col-span-3">
                            <NeonInput type="date" value={cfg.dateFrom} onChange={(e) => set("dateFrom")(e.target.value)} />
                        </Field>
                        <Field label="To" className="sm:col-span-3">
                            <NeonInput type="date" value={cfg.dateTo} onChange={(e) => set("dateTo")(e.target.value)} />
                        </Field>
                        <Field label="Data Source File" className="sm:col-span-6">
                            <NeonInput value={cfg.dataFile} onChange={(e) => set("dataFile")(e.target.value)} />
                        </Field>
                    </div>
                </NeonPanel>
                </BuilderFocusCard>

                <BuilderFocusCard id="structure" activeId={activeBuilderCard} onActivate={setActiveBuilderCard}>
                <NeonPanel title="Structure Settings" className="flex-1">
                    <div className="grid grid-cols-2 gap-3">
                        <Field label="Swing Length">
                            <NeonInput type="number" min="2" max="30" value={cfg.swing} onChange={(e) => set("swing")(Number(e.target.value))} />
                        </Field>
                        <Field label="OB Filter">
                            <NeonSelect value={cfg.obFilter} onChange={set("obFilter")} options={[{ value: "ATR", label: "ATR" }, { value: "CMR", label: "Cumulative Mean Range" }]} />
                        </Field>
                        <Field label="Min OB Size (pips)" hint="Filters OBs by width before trade simulation. Use 0 for no minimum.">
                            <NeonInput type="number" min="0" step="0.1" value={cfg.minObSizePips} onChange={(e) => set("minObSizePips")(Number(e.target.value))} />
                        </Field>
                        <Field label="Max OB Size (pips)" hint="Filters OBs by width before trade simulation. Use 100 for baseline EURUSD.">
                            <NeonInput type="number" min="0.1" step="0.1" value={cfg.maxObSizePips} onChange={(e) => set("maxObSizePips")(Number(e.target.value))} />
                        </Field>
                        <div className="col-span-2">
                            <div className="control-label text-[10.5px] font-ui uppercase tracking-wider text-muted-lab mb-2">Structure Direction</div>
                            <div className="flex flex-wrap gap-2">
                                {[
                                    { key: "bosLong",    label: "BOS Long",    excludedBy: cfg.direction === "Short" ? "Short" : null },
                                    { key: "bosShort",   label: "BOS Short",   excludedBy: cfg.direction === "Long"  ? "Long"  : null },
                                    { key: "chochLong",  label: "CHoCH Long",  excludedBy: cfg.direction === "Short" ? "Short" : null },
                                    { key: "chochShort", label: "CHoCH Short", excludedBy: cfg.direction === "Long"  ? "Long"  : null },
                                ].map(({ key, label, excludedBy }) => (
                                    <button
                                        key={key}
                                        onClick={() => { if (!excludedBy) set(key)(!cfg[key]); }}
                                        title={excludedBy ? `Excluded by Trade Direction = ${excludedBy}` : undefined}
                                        className={`clip-bevel-sm px-2.5 py-1 text-[11px] font-ui uppercase tracking-wider border transition-colors ${
                                            excludedBy
                                                ? "border-[hsl(var(--border-mid))] text-[hsl(var(--text-2)/0.3)] cursor-not-allowed opacity-40"
                                                : cfg[key]
                                                ? "border-[hsl(var(--accent-primary))] bg-[hsl(var(--accent-primary)/0.15)] text-white"
                                                : "border-[hsl(var(--border-mid))] text-[hsl(var(--text-2))] hover:border-[hsl(var(--accent-secondary))]"
                                        }`}
                                    >
                                        {label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                </NeonPanel>
                </BuilderFocusCard>

                <BuilderFocusCard id="execution" activeId={activeBuilderCard} onActivate={setActiveBuilderCard}>
                <NeonPanel title="Execution Settings" className="flex-1">
                    <div className="grid grid-cols-2 gap-3">
                        <Field label="RR Multiple">
                            <NeonInput data-testid="bld-rr" type="number" step="0.1" value={cfg.rr} onChange={(e) => set("rr")(Number(e.target.value))} />
                        </Field>
                        <Field label="Entry Buffer (pips)">
                            <NeonInput type="number" step="0.1" value={cfg.entryBuffer} onChange={(e) => set("entryBuffer")(Number(e.target.value))} />
                        </Field>
                        <Field label="Stop Buffer (pips)">
                            <NeonInput type="number" step="0.1" value={cfg.stopBuffer} onChange={(e) => set("stopBuffer")(Number(e.target.value))} />
                        </Field>
                        <Field label="Verify Limit (ticks)">
                            <NeonInput type="number" value={cfg.verifyTicks} onChange={(e) => set("verifyTicks")(Number(e.target.value))} />
                        </Field>
                        <Field
                            label={
                                <LabelWithTooltip
                                    label="Execution Mode"
                                    help={`How many trades the strategy can hold at once.\n\nSingle: only one trade open at a time.\nMulti: multiple trades can run simultaneously.\nOne/Dir: one long and one short can coexist, but not multiple in the same direction.`}
                                />
                            }
                            className="col-span-2"
                        >
                            <Segment
                                options={[
                                    { value: "multi_position", label: "Multi" },
                                    { value: "single_position", label: "Single" },
                                    { value: "one_per_direction", label: "One/Dir" },
                                ]}
                                value={cfg.executionMode}
                                onChange={set("executionMode")}
                            />
                        </Field>
                        <Field
                            label={
                                <LabelWithTooltip
                                    label="Position Conflict"
                                    help={`What happens when a new signal conflicts with an existing trade.\n\nBlock Opposite: ignore conflicting opposite trades.\nAllow Auto Reversal: close current trade and flip into the opposite setup.`}
                                />
                            }
                            className="col-span-2"
                        >
                            <Segment options={["Allow Auto Reversal", "Block Opposite"]} value={cfg.conflict} onChange={set("conflict")} />
                        </Field>
                        <Field
                            label={
                                <LabelWithTooltip
                                    label="If Cancelled by Conflict"
                                    help={`What happens to a blocked setup.\n\nKill OB: discard it permanently.\nAllow Resume: pause it and allow activation later.\nKill If Touched: invalidate if price touches it while paused.`}
                                />
                            }
                            className={`col-span-2 transition-opacity ${cfg.conflict === "Allow Auto Reversal" ? "opacity-45" : ""}`}
                        >
                            <div className={cfg.conflict === "Allow Auto Reversal" ? "pointer-events-none" : ""} aria-disabled={cfg.conflict === "Allow Auto Reversal"}>
                                <Segment options={["Kill OB", "Allow Resume", "Kill If Touched"]} value={cfg.cancelAction} onChange={set("cancelAction")} />
                            </div>
                        </Field>
                    </div>
                </NeonPanel>
                </BuilderFocusCard>

                {/* ── Middle row: Filters (left 2/3) + Entry Mode + Advanced (right 1/3) ── */}
                <div className="lg:col-span-3 grid grid-cols-1 lg:grid-cols-3 gap-4 items-stretch">
                <div className="lg:col-span-2 flex flex-col">
                <BuilderFocusCard id="filters" activeId={activeBuilderCard} onActivate={setActiveBuilderCard} className="flex-1">
                <NeonPanel title="Filters" className="flex-1">
                    <>
                            <div className="flex items-center justify-between mb-3">
                                <div>
                                    <SectionTitle>Session Filtering</SectionTitle>
                                    <div className="mt-1 text-[10.5px] text-muted-lab">Filters fill session during backtest. Requires rerun.</div>
                                </div>
                                <NeonToggle checked={cfg.sessionFilter} onChange={set("sessionFilter")} label="Enabled" testId="bld-session-toggle" />
                            </div>
                            <div className="flex flex-wrap gap-2 mb-4">
                                {[
                                    ["london", "London"], ["lull", "London Lull"], ["newYork", "New York"], ["asia", "Asia"], ["outside", "Outside"],
                                ].map(([k, label]) => (
                                    <button
                                        key={k}
                                        onClick={() => set(k)(!cfg[k])}
                                        className={`clip-bevel-sm px-2.5 py-1 text-[11px] font-ui uppercase tracking-wider border transition-colors ${
                                            cfg[k]
                                                ? "border-[hsl(var(--accent-primary))] bg-[hsl(var(--accent-primary)/0.15)] text-white"
                                                : "border-[hsl(var(--border-mid))] text-[hsl(var(--text-2))] hover:border-[hsl(var(--accent-secondary))]"
                                        }`}
                                    >
                                        {label}
                                    </button>
                                ))}
                            </div>
                            {sessionSelectionWarning && (
                                <div className="mb-4 border border-[hsl(var(--warning)/0.4)] bg-[hsl(var(--warning)/0.06)] clip-bevel-sm px-3 py-2 text-[10.5px] font-ui uppercase tracking-wider text-[hsl(var(--warning))]">
                                    Select at least one session or disable session filtering.
                                </div>
                            )}
                            <div className="grid grid-cols-2 gap-3">
                                <Field label="OB Origin Session">
                                    <NeonSelect value={cfg.originSession} onChange={set("originSession")} options={["Any", "London", "London Lull", "New York", "Asia"]} />
                                </Field>
                                <Field label="OB Detection Session">
                                    <NeonSelect value={cfg.detectionSession} onChange={set("detectionSession")} options={["Any", "London", "London Lull", "New York", "Asia"]} />
                                </Field>
                                <div className="col-span-2 border border-[hsl(var(--accent-primary)/0.28)] bg-gradient-to-b from-[hsl(var(--accent-primary)/0.03)] to-transparent clip-bevel-sm p-3">
                                    <div className="flex items-center justify-between gap-3">
                                        <div>
                                            <div className="control-label text-[11px] font-ui uppercase tracking-wider text-muted-lab">News Blackout</div>
                                            <div className="text-[10.5px] text-muted-lab">Blocks fills around matching news events. Before/after windows can be different.</div>
                                        </div>
                                        <NeonToggle checked={cfg.newsBlackout} onChange={set("newsBlackout")} />
                                    </div>
                                    <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        <Field label="Blackout Before News (minutes)">
                                            <NeonInput type="number" min="0" step="1" value={cfg.newsBlackoutBefore} onChange={(e) => set("newsBlackoutBefore")(Number(e.target.value))} />
                                        </Field>
                                        <Field label="Blackout After News (minutes)">
                                            <NeonInput type="number" min="0" step="1" value={cfg.newsBlackoutAfter} onChange={(e) => set("newsBlackoutAfter")(Number(e.target.value))} />
                                        </Field>
                                        <div className="sm:col-span-2">
                                            <div className="control-label mb-2 text-[11px] font-ui uppercase tracking-wider text-muted-lab">Impacts</div>
                                            <div className="flex flex-wrap gap-2">
                                                {["low", "medium", "high"].map((impact) => (
                                                    <button
                                                        key={impact}
                                                        onClick={() => toggleNewsImpact(impact)}
                                                        className={`clip-bevel-sm px-2.5 py-1 text-[11px] font-ui uppercase tracking-wider border transition-colors ${
                                                            cfg.newsBlackoutImpacts?.includes(impact)
                                                                ? "border-[hsl(var(--accent-primary))] bg-[hsl(var(--accent-primary)/0.15)] text-white"
                                                                : "border-[hsl(var(--border-mid))] text-[hsl(var(--text-2))] hover:border-[hsl(var(--accent-secondary))]"
                                                        }`}
                                                    >
                                                        {impact}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                        {/* News behaviour flags — all required for funded-account parity */}
                                        <div className="sm:col-span-2 mt-1 border-t border-[hsl(var(--border-soft))] pt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                                            <div className="flex items-center justify-between gap-3">
                                                <div>
                                                    <div className="control-label text-[11px] font-ui uppercase tracking-wider text-muted-lab">Pause Pending Orders</div>
                                                    <div className="text-[10px] text-muted-lab">Suspend unfilled OBs during blackout; rearm after</div>
                                                </div>
                                                <NeonToggle checked={cfg.newsPausePending} onChange={set("newsPausePending")} />
                                            </div>
                                            <div className="flex items-center justify-between gap-3">
                                                <div>
                                                    <div className="control-label text-[11px] font-ui uppercase tracking-wider text-muted-lab">Block New Fills</div>
                                                    <div className="text-[10px] text-muted-lab">Prevent entry fills while inside blackout window</div>
                                                </div>
                                                <NeonToggle checked={cfg.newsBlockFills} onChange={set("newsBlockFills")} />
                                            </div>
                                            <div className="flex items-center justify-between gap-3">
                                                <div>
                                                    <div className="control-label text-[11px] font-ui uppercase tracking-wider text-muted-lab">Cancel If Touched (blackout)</div>
                                                    <div className="text-[10px] text-muted-lab">Export NEWS_TOUCH_CANCEL if paused OB is touched</div>
                                                </div>
                                                <NeonToggle checked={cfg.newsCancelIfTouched} onChange={set("newsCancelIfTouched")} />
                                            </div>
                                            <div className="flex items-center justify-between gap-3">
                                                <div>
                                                    <div className="control-label text-[11px] font-ui uppercase tracking-wider text-muted-lab">Flatten Active Trades</div>
                                                    <div className="text-[10px] text-muted-lab">Close live positions before blackout start</div>
                                                </div>
                                                <NeonToggle checked={cfg.newsFlattenActiveTrades} onChange={set("newsFlattenActiveTrades")} />
                                            </div>
                                            <Field label="Flatten X min Before Blackout" className="sm:col-span-2">
                                                <NeonInput type="number" min="0" step="1" value={cfg.newsFlattenMinutesBefore} onChange={(e) => set("newsFlattenMinutesBefore")(Number(e.target.value))} />
                                            </Field>
                                            <Field label="Debug OB IDs (comma-separated, e.g. 32,47)" className="sm:col-span-2">
                                                <NeonInput
                                                    type="text"
                                                    placeholder="32,47"
                                                    value={cfg.newsDebugObIds}
                                                    onChange={(e) => set("newsDebugObIds")(e.target.value)}
                                                />
                                            </Field>
                                        </div>
                                    </div>
                                </div>
                            </div>
                    </>
                </NeonPanel>
                </BuilderFocusCard>
                </div>{/* end left Filters col */}
                <div className="flex flex-col gap-4">
                {/* ── Entry Configuration panel ─────────────────────────────── */}
                <BuilderFocusCard id="entry-configuration" activeId={activeBuilderCard} onActivate={setActiveBuilderCard}>
                <NeonPanel title="Entry Configuration">
                    {/* Section A: Direction Scope */}
                    <div className="mb-4">
                        <div className="control-label text-[10.5px] font-ui uppercase tracking-wider text-muted-lab mb-2">Direction Scope</div>
                        <Segment options={["Long", "Short", "Both"]} value={cfg.direction} onChange={set("direction")} />
                    </div>

                    {/* Section B: Entry Assignment */}
                    <div className="mb-4">
                        <div className="control-label text-[10.5px] font-ui uppercase tracking-wider text-muted-lab mb-2">Entry Assignment</div>
                        <Segment
                            options={[
                                { value: "symmetric", label: "Symmetric" },
                                { value: "asymmetric", label: "Asymmetric" },
                            ]}
                            value={cfg.directionalEntryMode}
                            onChange={set("directionalEntryMode")}
                        />
                        <div className="mt-2 text-[10.5px] text-muted-lab">
                            {cfg.directionalEntryMode === "symmetric"
                                ? "Longs and shorts use the same entry model."
                                : "Assign separate entry models for long and short trades."}
                        </div>
                    </div>

                    {/* Section C: Entry Model (symmetric only) */}
                    {cfg.directionalEntryMode === "symmetric" && (
                        <div className="mb-4">
                            <div className="control-label text-[10.5px] font-ui uppercase tracking-wider text-muted-lab mb-2">Entry Model</div>
                            <Segment
                                options={[
                                    { value: "baseline", label: "Baseline Edge" },
                                    { value: "entry_penetration", label: "Penetration" },
                                    { value: "triggered_edge", label: "Triggered Edge" },
                                ]}
                                value={cfg.selectedEntryModel}
                                onChange={set("selectedEntryModel")}
                            />

                            {/* Baseline */}
                            {cfg.selectedEntryModel === "baseline" && (
                                <div className="mt-3 border border-[hsl(var(--border-soft))] clip-bevel-sm p-3">
                                    <div className="mb-2 text-[10.5px] text-muted-lab">
                                        Standard resting limit at the OB edge or selected depth. This is the run&apos;s baseline reference output used for scenario comparisons.
                                    </div>
                                    <Field label="Limit Placement Depth">
                                        <Segment
                                            options={[
                                                { value: 0, label: "Edge" },
                                                { value: 25, label: "25%" },
                                                { value: 50, label: "50%" },
                                                { value: 75, label: "75%" },
                                                { value: 100, label: "100%" },
                                            ]}
                                            value={Number(cfg.obEntryDepthPct ?? 0)}
                                            onChange={(value) => set("obEntryDepthPct")(Number(value))}
                                        />
                                    </Field>
                                    <div className="mt-2 text-[10.5px] text-muted-lab">
                                        Moves the resting limit deeper into the OB. Changes the baseline reference configuration for this run — does not create separate scenario result views.
                                    </div>
                                </div>
                            )}

                            {/* Penetration */}
                            {cfg.selectedEntryModel === "entry_penetration" && (
                                <div className="mt-3 border border-[hsl(var(--border-soft))] clip-bevel-sm p-3">
                                    <div className="mb-3 text-[10.5px] text-muted-lab">
                                        Conditional depth entry. Only enters when price first reaches the penetration threshold inside the OB. Produces a separate scenario result view — the baseline reference is always included for comparison. Not the same as Limit Placement Depth.
                                    </div>
                                    <Field label="Penetration Threshold %">
                                        <NeonInput
                                            type="number"
                                            min="1"
                                            max="99"
                                            step="1"
                                            value={cfg.singlePenetrationPct}
                                            onChange={(e) => set("singlePenetrationPct")(Number(e.target.value))}
                                        />
                                    </Field>
                                </div>
                            )}

                            {/* Triggered Edge */}
                            {cfg.selectedEntryModel === "triggered_edge" && (
                                <div className="mt-3 border border-[hsl(var(--border-soft))] clip-bevel-sm p-3">
                                    <div className="text-[10.5px] text-muted-lab mb-3">
                                        Arms the trade only after price reaches the trigger threshold, then places a limit at the configured entry level. Entry delay controls when the order can arm after the trigger.
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                        <Field label="Trigger Threshold %">
                                            <NeonInput
                                                type="number"
                                                min="1"
                                                max="99"
                                                step="1"
                                                value={cfg.singleTriggeredEdgeThreshold}
                                                onChange={(e) => set("singleTriggeredEdgeThreshold")(Number(e.target.value))}
                                            />
                                        </Field>
                                        <Field label="Entry Level %" hint="0 is the OB edge.">
                                            <NeonInput
                                                type="number"
                                                min="0"
                                                max="100"
                                                step="1"
                                                value={cfg.triggeredEdgeEntryLevelPct}
                                                onChange={(e) => set("triggeredEdgeEntryLevelPct")(Number(e.target.value))}
                                            />
                                        </Field>
                                        <Field label="Entry Delay After Trigger" hint="0 = same · 1 = next · 2/3 = deferred" className="col-span-2">
                                            <div className="flex gap-2">
                                                {[{ d: 0, label: "0 · Same" }, { d: 1, label: "1 · Next" }, { d: 2, label: "2" }, { d: 3, label: "3" }].map(({ d, label }) => {
                                                    const delays = Array.isArray(cfg.triggeredEdgeDelays) ? cfg.triggeredEdgeDelays : [0, 1];
                                                    const active = delays.includes(d);
                                                    return (
                                                        <button
                                                            key={d}
                                                            type="button"
                                                            onClick={() => {
                                                                const next = active
                                                                    ? delays.filter((x) => x !== d)
                                                                    : [...delays, d].sort((a, b) => a - b);
                                                                if (next.length === 0) return;
                                                                const hasZero = next.includes(0);
                                                                const hasOne  = next.includes(1);
                                                                const legacyMode = hasZero && hasOne ? "both" : hasZero ? "same" : hasOne ? "next" : "both";
                                                                setCfg((c) => ({ ...c, triggeredEdgeDelays: next, triggeredEdgeSameCandleMode: legacyMode }));
                                                            }}
                                                            className={[
                                                                "px-3 py-1.5 text-[10.5px] font-ui uppercase tracking-[0.08em] clip-bevel-sm border transition-colors",
                                                                active
                                                                    ? "border-[hsl(var(--accent-primary)/0.7)] bg-[hsl(var(--accent-primary)/0.12)] text-[hsl(var(--accent-primary))]"
                                                                    : "border-[hsl(var(--border-soft))] bg-transparent text-[hsl(var(--text-2)/0.5)] hover:text-[hsl(var(--text-2))]",
                                                            ].join(" ")}
                                                        >
                                                            {label}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </Field>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Section D: Directional Entry Cards (asymmetric only) */}
                    {cfg.directionalEntryMode === "asymmetric" && (
                        <div className="mb-4 space-y-3">
                            <div className="flex items-start gap-2 border border-[hsl(var(--warning)/0.45)] bg-[hsl(var(--warning)/0.07)] clip-bevel-sm px-3 py-2">
                                <ShieldAlert className="w-3.5 h-3.5 shrink-0 mt-0.5 text-[hsl(var(--warning))]" />
                                <div className="text-[10.5px] text-[hsl(var(--warning))]">
                                    Config foundation only — directional entry fields are emitted for the backtester, but true mixed-direction simulation requires backend Phase 3 support. Use Session Lab Asymmetric Preview for approximate research until then.
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div className={cfg.direction === "Short" ? "opacity-40 pointer-events-none" : ""}>
                                    {cfg.direction === "Short" && (
                                        <div className="text-[10px] text-muted-lab italic mb-1.5">Long trades excluded by Trade Direction = Short Only.</div>
                                    )}
                                    <DirectionalEntryCard
                                        label="Long Entries"
                                        enabled={cfg.longEntryEnabled}
                                        entryModel={cfg.longEntryModel}
                                        penetrationPct={cfg.longPenetrationPct}
                                        triggeredEdgeThreshold={cfg.longTriggeredEdgeThreshold}
                                        triggeredEdgeDelays={cfg.longTriggeredEdgeDelays}
                                        onChange={(suffix, value) => set(`long${suffix}`)(value)}
                                    />
                                </div>
                                <div className={cfg.direction === "Long" ? "opacity-40 pointer-events-none" : ""}>
                                    {cfg.direction === "Long" && (
                                        <div className="text-[10px] text-muted-lab italic mb-1.5">Short trades excluded by Trade Direction = Long Only.</div>
                                    )}
                                    <DirectionalEntryCard
                                        label="Short Entries"
                                        enabled={cfg.shortEntryEnabled}
                                        entryModel={cfg.shortEntryModel}
                                        penetrationPct={cfg.shortPenetrationPct}
                                        triggeredEdgeThreshold={cfg.shortTriggeredEdgeThreshold}
                                        triggeredEdgeDelays={cfg.shortTriggeredEdgeDelays}
                                        onChange={(suffix, value) => set(`short${suffix}`)(value)}
                                    />
                                </div>
                            </div>
                            <div className="text-[10px] text-muted-lab border border-[hsl(var(--border-soft))] clip-bevel-sm px-3 py-2">
                                Session-specific long/short rules will build on this structure later.
                            </div>
                        </div>
                    )}

                    {/* Section E: Pre-Trigger OB Protection */}
                    {showEntryProtection && (
                        <div className="mb-4 border border-[hsl(var(--border-soft))] clip-bevel-sm p-3 space-y-3">

                            {/* Header */}
                            <div>
                                <div className="control-label text-[10.5px] font-ui uppercase tracking-wider text-muted-lab">Pre-Trigger OB Protection</div>
                                <div className="mt-1 text-[10.5px] text-muted-lab">
                                    Remove an OB from the entry pool when price interacts with it but fails to confirm the triggered-edge entry. Cancelled OBs are tracked as ghost candidates in post-run analysis.
                                </div>
                            </div>

                            {/* A · Retrace Cancel */}
                            <div className="border-t border-[hsl(var(--border-soft))] pt-3">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <div className="control-label text-[11px] font-ui uppercase tracking-wider text-muted-lab">Enable Retrace Cancel</div>
                                        <div className="text-[10.5px] text-muted-lab">Cancels a tapped-but-untriggered OB if price moves away from the zone before reaching the entry trigger.</div>
                                    </div>
                                    <NeonToggle checked={Boolean(cfg.triggeredEdgeCancelOnRetrace)} onChange={set("triggeredEdgeCancelOnRetrace")} />
                                </div>
                                {cfg.triggeredEdgeCancelOnRetrace && (
                                    <div className="mt-2 grid grid-cols-2 gap-3">
                                        <Field label="Retrace Distance (pips)" hint="Cancel when price moves this many pips above the OB edge">
                                            <NeonInput type="number" min="0" step="0.1" value={cfg.triggeredEdgeCancelRetracePips} onChange={(e) => set("triggeredEdgeCancelRetracePips")(Number(e.target.value))} />
                                        </Field>
                                        <Field label="Retrace Distance (OB %)" hint="Alternative threshold: X% of OB height above the edge">
                                            <NeonInput type="number" min="0" step="1" value={cfg.triggeredEdgeCancelRetraceObPct} onChange={(e) => set("triggeredEdgeCancelRetraceObPct")(Number(e.target.value))} />
                                        </Field>
                                    </div>
                                )}
                            </div>

                            {/* B · First Failed Tag */}
                            <div className="border-t border-[hsl(var(--border-soft))] pt-3">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <div className="control-label text-[11px] font-ui uppercase tracking-wider text-muted-lab">Enable First Failed Tag Cancel</div>
                                        <div className="text-[10.5px] text-muted-lab">Cancels an OB after the first failed visit: price tags the OB, fails to reach the trigger threshold, then exits the OB.</div>
                                    </div>
                                    <NeonToggle checked={Boolean(cfg.triggeredEdgeCancelOnFirstFailedTag)} onChange={set("triggeredEdgeCancelOnFirstFailedTag")} />
                                </div>
                                {cfg.triggeredEdgeCancelOnFirstFailedTag && (
                                    <div className="mt-3 space-y-1.5">
                                        <div className="control-label text-[10.5px] font-ui uppercase tracking-wider text-muted-lab">Move-Away Distance</div>
                                        <div className="text-[10px] text-muted-lab">0 = immediate cancel. Price must leave the order block and move away by the configured distance before FFT cancellation is allowed.</div>
                                        <div className="grid grid-cols-2 gap-3 mt-2">
                                            <Field label="Move Away (Pips)" hint="Cancel only after price exits the OB and moves this many additional pips away. 0 = immediate.">
                                                <NeonInput type="number" min="0" step="0.1" value={cfg.triggeredEdgeFftMoveAwayPips ?? 0} onChange={(e) => set("triggeredEdgeFftMoveAwayPips")(Number(e.target.value))} />
                                            </Field>
                                            <Field label="Move Away (OB Multiple)" hint="Threshold = OB height × multiple. The stricter of pips / multiple applies. 0 = disabled.">
                                                <NeonInput type="number" min="0" step="0.05" value={cfg.triggeredEdgeFftMoveAwayObMultiple ?? 0} onChange={(e) => set("triggeredEdgeFftMoveAwayObMultiple")(Number(e.target.value))} />
                                            </Field>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Coming later — display-only, no backend config emitted */}
                            <div className="border-t border-[hsl(var(--border-soft))] pt-3">
                                <div className="control-label text-[10px] font-ui uppercase tracking-wider mb-2" style={{ color: "hsl(var(--text-2) / 0.35)" }}>
                                    Coming later — not active in this backtest
                                </div>
                                <div className="space-y-1.5 opacity-35 pointer-events-none select-none" aria-hidden="true">
                                    {[
                                        "Cancel after N failed tags",
                                        "Cancel after X candles from first tag",
                                        "Cancel at session boundary",
                                        "Cancel after retrace by OB-height multiple",
                                        "Cancel after structure break",
                                        "Delay-arm validity: cancel if OB exits before arm",
                                    ].map((label) => (
                                        <div key={label} className="flex items-center justify-between border border-[hsl(var(--border-soft))] clip-bevel-sm px-3 py-2">
                                            <div className="text-[10.5px] text-muted-lab">{label}</div>
                                            <div className="w-7 h-3.5 rounded-full bg-[hsl(var(--border-soft))]" />
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="text-[10px] text-muted-lab italic border-t border-[hsl(var(--border-soft))] pt-2">
                                Applies to all triggered-edge models, including directional long/short.
                            </div>
                        </div>
                    )}

                    {/* Section F: Scenario Batch */}
                    <div className="border border-[hsl(var(--border-soft))] clip-bevel-sm p-3">
                        <div className="flex items-center justify-between">
                            <div>
                                <div className="control-label text-[10.5px] font-ui uppercase tracking-wider text-muted-lab">Scenario Batch</div>
                                <div className="text-[10px] text-muted-lab">Export baseline plus multiple scenario result views in one run. Each becomes a selectable Result View in Run Workspace.</div>
                            </div>
                            <NeonToggle
                                checked={cfg.entryMode === "research"}
                                onChange={(v) => set("entryMode")(v ? "research" : "single")}
                            />
                        </div>
                        {cfg.entryMode === "research" && (
                            <div className="mt-3 space-y-3">
                                {/* A · Baseline Limit Placement Depth */}
                                <div className="border border-[hsl(var(--border-soft))] clip-bevel-sm p-3">
                                    <div className="mb-2">
                                        <div className="control-label text-[10.5px] font-ui uppercase tracking-wider text-muted-lab">A · Baseline Limit Placement Depth</div>
                                        <div className="text-[10px] text-muted-lab">Sets the resting limit depth for the baseline reference output. Does not create scenario result views.</div>
                                    </div>
                                    <Segment
                                        options={[
                                            { value: 0, label: "Edge" },
                                            { value: 25, label: "25%" },
                                            { value: 50, label: "50%" },
                                            { value: 75, label: "75%" },
                                            { value: 100, label: "100%" },
                                        ]}
                                        value={Number(cfg.obEntryDepthPct ?? 0)}
                                        onChange={(value) => set("obEntryDepthPct")(Number(value))}
                                    />
                                </div>

                                {/* B · Penetration Scenario Result Views */}
                                <div className="border border-[hsl(var(--border-soft))] clip-bevel-sm p-3">
                                    <div className="mb-2 flex items-center justify-between">
                                        <div>
                                            <div className="control-label text-[10.5px] font-ui uppercase tracking-wider text-muted-lab">B · Penetration Scenario Views</div>
                                            <div className="text-[10px] text-muted-lab">Conditional depth entry — only enters when price first reaches the threshold. Each threshold exports a separate scenario result view alongside the baseline reference.</div>
                                        </div>
                                        <NeonToggle
                                            checked={Boolean(cfg.entryResearchExports)}
                                            onChange={(val) => {
                                                if (!val) {
                                                    setCfg((c) => ({ ...c, entryResearchExports: false, entryResearchExportMode: "off", entryPenetrationThresholds: "" }));
                                                } else {
                                                    setCfg((c) => ({ ...c, entryResearchExports: true, entryResearchExportMode: c.entryResearchExportMode === "off" ? "light" : c.entryResearchExportMode, entryPenetrationThresholds: c.entryPenetrationThresholds || "25,50" }));
                                                }
                                            }}
                                        />
                                    </div>
                                    {cfg.entryResearchExports && (
                                        <div className="grid grid-cols-2 gap-3 mt-2">
                                            <Field label="Preset" className="col-span-2" hint="Light is the default. Custom exposes raw thresholds.">
                                                <NeonSelect
                                                    value={resolveEntryExportMode(cfg) === "off" ? "light" : resolveEntryExportMode(cfg)}
                                                    onChange={(value) => {
                                                        if (value === "full") {
                                                            setCfg((current) => ({ ...current, entryResearchExportMode: "full", entryResearchExports: true, entryPenetrationThresholds: "10,25,50,75" }));
                                                        } else if (value === "custom") {
                                                            setCfg((current) => ({ ...current, entryResearchExportMode: "custom", entryResearchExports: true, entryPenetrationThresholds: current.entryPenetrationThresholds || "25,50" }));
                                                        } else {
                                                            setCfg((current) => ({ ...current, entryResearchExportMode: "light", entryResearchExports: true, entryPenetrationThresholds: "25,50" }));
                                                        }
                                                    }}
                                                    options={[
                                                        { value: "light", label: "Light / 25,50" },
                                                        { value: "full", label: "Full / 10,25,50,75" },
                                                        { value: "custom", label: "Custom" },
                                                    ]}
                                                />
                                            </Field>
                                            {entryExportFullRangeWarning(cfg) && (
                                                <div className="col-span-2 border border-[hsl(var(--warning)/0.45)] bg-[hsl(var(--warning)/0.07)] clip-bevel-sm px-3 py-2 text-[10.5px] text-[hsl(var(--warning))]">
                                                    Full entry exports rerun the complete simulation for every threshold. Use Light or shorten the date range before a long backtest.
                                                </div>
                                            )}
                                            {resolveEntryExportMode(cfg) === "custom" && (
                                                <Field label="Thresholds" className="col-span-2" hint="Comma-separated percentages. Valid values are greater than 0 and less than 100.">
                                                    <NeonInput
                                                        value={cfg.entryPenetrationThresholds}
                                                        onChange={(e) => set("entryPenetrationThresholds")(e.target.value)}
                                                    />
                                                </Field>
                                            )}
                                            <div className="col-span-2 flex items-center justify-between border border-[hsl(var(--border-soft))] clip-bevel-sm p-3">
                                                <div>
                                                    <div className="control-label text-[11px] font-ui uppercase tracking-wider text-muted-lab">Optimized batched entry engine</div>
                                                    <div className="text-[10.5px] text-muted-lab">
                                                        Default on. Evaluates penetration thresholds in one shared pass.
                                                    </div>
                                                </div>
                                                <NeonToggle
                                                    checked={Boolean(cfg.useBatchedEntryPenetration)}
                                                    onChange={set("useBatchedEntryPenetration")}
                                                />
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* C · Triggered Edge Scenario Result Views */}
                                <div className="border border-[hsl(var(--border-soft))] clip-bevel-sm p-3">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <div className="control-label text-[10.5px] font-ui uppercase tracking-wider text-muted-lab">C · Triggered Edge Scenario Views</div>
                                            <div className="text-[10px] text-muted-lab">Arms only after price reaches the trigger threshold, then places a limit at the configured entry level. Entry delay controls when the order arms after the trigger. Exports one result view per threshold × delay.</div>
                                        </div>
                                        <NeonToggle checked={Boolean(cfg.triggeredEdgeEntries)} onChange={set("triggeredEdgeEntries")} />
                                    </div>
                                    {cfg.triggeredEdgeEntries && (
                                        <div className="grid grid-cols-2 gap-3 mt-2">
                                            <Field label="Trigger Thresholds" hint="Comma-separated OB penetration percentages.">
                                                <NeonInput value={cfg.triggeredEdgeThresholds} onChange={(e) => set("triggeredEdgeThresholds")(e.target.value)} />
                                            </Field>
                                            <Field label="Entry Level %" hint="0 is the OB edge.">
                                                <NeonInput type="number" min="0" max="100" step="1" value={cfg.triggeredEdgeEntryLevelPct} onChange={(e) => set("triggeredEdgeEntryLevelPct")(Number(e.target.value))} />
                                            </Field>
                                            <Field label="Entry Delay After Trigger" hint="0 = same · 1 = next · 2/3 = deferred" className="col-span-2">
                                                <div className="flex gap-2">
                                                    {[{ d: 0, label: "0 · Same" }, { d: 1, label: "1 · Next" }, { d: 2, label: "2" }, { d: 3, label: "3" }].map(({ d, label }) => {
                                                        const delays = Array.isArray(cfg.triggeredEdgeDelays) ? cfg.triggeredEdgeDelays : [0, 1];
                                                        const active = delays.includes(d);
                                                        return (
                                                            <button
                                                                key={d}
                                                                type="button"
                                                                onClick={() => {
                                                                    const next = active
                                                                        ? delays.filter((x) => x !== d)
                                                                        : [...delays, d].sort((a, b) => a - b);
                                                                    if (next.length === 0) return;
                                                                    const hasZero = next.includes(0);
                                                                    const hasOne  = next.includes(1);
                                                                    const legacyMode = hasZero && hasOne ? "both" : hasZero ? "same" : hasOne ? "next" : "both";
                                                                    setCfg((c) => ({ ...c, triggeredEdgeDelays: next, triggeredEdgeSameCandleMode: legacyMode }));
                                                                }}
                                                                className={[
                                                                    "px-3 py-1.5 text-[10.5px] font-ui uppercase tracking-[0.08em] clip-bevel-sm border transition-colors",
                                                                    active
                                                                        ? "border-[hsl(var(--accent-primary)/0.7)] bg-[hsl(var(--accent-primary)/0.12)] text-[hsl(var(--accent-primary))]"
                                                                        : "border-[hsl(var(--border-soft))] bg-transparent text-[hsl(var(--text-2)/0.5)] hover:text-[hsl(var(--text-2))]",
                                                                ].join(" ")}
                                                            >
                                                                {label}
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </Field>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </NeonPanel>
                </BuilderFocusCard>

                <BuilderFocusCard id="advanced" activeId={activeBuilderCard} onActivate={setActiveBuilderCard} className="flex-1">
                <NeonPanel title="Advanced" className="flex-1">
                    <div className="grid grid-cols-2 gap-3">
                        <Field label="Spread (pips)"><NeonInput type="number" step="0.05" value={cfg.spread} onChange={(e) => set("spread")(Number(e.target.value))} /></Field>
                        <Field label="Slippage (pips)"><NeonInput type="number" step="0.05" value={cfg.slippage} onChange={(e) => set("slippage")(Number(e.target.value))} /></Field>
                        <Field label="Commission (R/trade)" className="col-span-2"><NeonInput type="number" step="0.01" value={cfg.commission} onChange={(e) => set("commission")(Number(e.target.value))} /></Field>
                        <div className="col-span-2 flex items-center justify-between border border-[hsl(var(--border-soft))] clip-bevel-sm p-3 opacity-50 pointer-events-none" aria-disabled="true">
                            <div>
                                <div className="control-label text-[11px] font-ui uppercase tracking-wider text-muted-lab">Monte Carlo</div>
                                <div className="text-[10.5px] text-muted-lab">Not yet wired to sidecar — no effect on generated config.</div>
                            </div>
                            <NeonToggle checked={cfg.monteCarlo} onChange={set("monteCarlo")} />
                        </div>
                    </div>
                </NeonPanel>
                </BuilderFocusCard>
                </div>{/* end right Entry Mode + Advanced col */}
                </div>{/* end middle row wrapper */}

                <BuilderFocusCard id="sanity" activeId={activeBuilderCard} onActivate={setActiveBuilderCard} className="lg:col-span-3">
                <NeonPanel
                    title="Last Run Sanity Check"
                    action={
                        <div className="flex items-center gap-2">
                            <NeonButton icon={Copy} tone="ghost" onClick={onCopyGeneratedConfig}>Copy Generated Config</NeonButton>
                            <NeonButton icon={Copy} tone="ghost" onClick={onCopyLastRun}>Copy Last Run JSON</NeonButton>
                        </div>
                    }
                >
                    <div className="mb-3 text-[10.5px] text-muted-lab">
                        Sanity check uses the latest generated config and local sidecar response. Full trade/order-block stats appear after import.
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-2">
                        <StatusMeta k="Status" v={sanityRun.status || "—"} />
                        <StatusMeta k="Job ID" v={sanityRun.job_id || "—"} />
                        <StatusMeta k="Output folder" v={sanityRun.output_folder || "—"} />
                        <StatusMeta k="Symbol" v={sanityConfig.symbol || sanityRun.current_symbol || "—"} />
                        <StatusMeta k="Detection TF" v={sanityConfig.detection_timeframe || "—"} />
                        <StatusMeta k="Execution TF" v={sanityConfig.execution_timeframe || "—"} />
                        <StatusMeta k="Execution mode" v={formatExecutionMode((sanityConfig.execution_modes || [])[0])} />
                        <StatusMeta k="Structure filter" v={formatStructureFilter(sanityConfig.structure_filter)} />
                        <StatusMeta k="Allowed struct/dir" v={Array.isArray(sanityConfig.allowed_structure_directions) && sanityConfig.allowed_structure_directions.length ? sanityConfig.allowed_structure_directions.join(", ") : "all"} />
                        <StatusMeta k="BOS Long skip" v={sanityRun.structure_direction_filter_skipped?.bos_long ?? "—"} />
                        <StatusMeta k="BOS Short skip" v={sanityRun.structure_direction_filter_skipped?.bos_short ?? "—"} />
                        <StatusMeta k="CHoCH Long skip" v={sanityRun.structure_direction_filter_skipped?.choch_long ?? "—"} />
                        <StatusMeta k="CHoCH Short skip" v={sanityRun.structure_direction_filter_skipped?.choch_short ?? "—"} />
                        <StatusMeta k="Plan passes" v={sanityRun.total_passes ?? generatedPlan.totalPasses ?? "—"} />
                        <StatusMeta k="Entry passes" v={sanityRun.scenario_plan_summary?.entry ?? generatedPlan.entry ?? "—"} />
                        <StatusMeta k="Protection passes" v={sanityRun.scenario_plan_summary?.protection ?? generatedPlan.protection ?? "—"} />
                        <StatusMeta k="Entry Mode" v={cfg.entryMode === "single" ? "Single Model" : "Scenario Batch"} />
                        {cfg.entryMode === "single" && (
                            <StatusMeta k="Active Entry Model" v={{ baseline: "Baseline Edge", entry_penetration: "Penetration", triggered_edge: "Triggered Edge" }[cfg.selectedEntryModel] || cfg.selectedEntryModel} />
                        )}
                        <StatusMeta k="Entry models" v={formatEntryModels(sanityConfig)} />
                        <StatusMeta k="Penetration thresholds" v={(sanityConfig.entry_penetration_thresholds || []).join(", ") || "—"} />
                        <StatusMeta k="Batch entry penetration" v={sanityConfig.batch_entry_penetration ? "On" : "Off"} />
                        <StatusMeta k="Triggered-edge triggers" v={(sanityConfig.triggered_edge_trigger_thresholds || []).join(", ") || "—"} />
                        <StatusMeta k="Triggered-edge entry delay" v={formatTriggeredEdgeDelays(sanityConfig.triggered_edge_candle_delays, sanityConfig.triggered_edge_same_candle_modes)} />
                        <StatusMeta k="Triggered-edge retrace cancel" v={formatTriggeredEdgeRetraceCancel(sanityConfig)} />
                        <StatusMeta k="First failed tag cancel" v={sanityConfig.triggered_edge_cancel_on_first_failed_tag ? "On" : "Off"} />
                        <StatusMeta k="Limit Placement Depth" v={formatPercentValue(sanityConfig.ob_entry_depth_pct)} />
                        <StatusMeta k="Entry Buffer" v={formatPipValue(sanityConfig.entry_buffer_pips)} />
                        <StatusMeta k="Stop Buffer" v={formatPipValue(sanityConfig.stop_buffer_pips)} />
                        <StatusMeta k="Verify Limit" v={formatTickValue(sanityConfig.verify_limit_ticks)} />
                        <StatusMeta k="Min OB Size" v={formatPipValue(sanityConfig.min_ob_size_pips)} />
                        <StatusMeta k="Max OB Size" v={formatPipValue(sanityConfig.max_ob_size_pips)} />
                        <StatusMeta k="Position conflict" v={cfg.conflict || "—"} />
                        <StatusMeta k="Session filter" v={sanityConfig.session_filter_enabled ? "Yes" : "No"} />
                        <StatusMeta k="Allowed sessions" v={(sanityConfig.allowed_sessions || []).join(", ") || "—"} />
                        <StatusMeta k="Disabled sessions" v={disabledSessionsFromConfig(sanityConfig).join(", ") || "—"} />
                        <StatusMeta k="Session filtered skipped" v={sanityRun.session_filtered_skipped ?? "—"} />
                        <StatusMeta k="News blackout" v={sanityConfig.news_blackout_enabled ? "Yes" : "No"} />
                        <StatusMeta k="News impacts" v={(sanityConfig.news_blackout_impacts || []).join(", ") || "—"} />
                        <StatusMeta k="News currencies" v={(sanityConfig.news_blackout_currencies || []).join(", ") || "—"} />
                        <StatusMeta k="News window" v={formatNewsWindow(sanityConfig)} />
                        <StatusMeta k="News pause pending" v={sanityConfig.news_pause_pending_orders != null ? (sanityConfig.news_pause_pending_orders ? "Yes" : "No") : "—"} />
                        <StatusMeta k="News block fills" v={sanityConfig.news_block_new_fills != null ? (sanityConfig.news_block_new_fills ? "Yes" : "No") : "—"} />
                        <StatusMeta k="News cancel if touched" v={sanityConfig.news_cancel_if_touched_during_blackout != null ? (sanityConfig.news_cancel_if_touched_during_blackout ? "Yes" : "No") : "—"} />
                        <StatusMeta k="News flatten active" v={sanityConfig.news_flatten_active_trades != null ? (sanityConfig.news_flatten_active_trades ? "Yes" : "No") : "—"} />
                        <StatusMeta k="Flatten before (min)" v={sanityConfig.news_flatten_minutes_before_blackout ?? "—"} />
                        <StatusMeta k="News events matched" v={sanityRun.news_events_matched ?? "—"} />
                        <StatusMeta k="News windows created" v={sanityRun.news_windows_created ?? "—"} />
                        <StatusMeta k="News blackout skipped" v={sanityRun.news_blackout_skipped ?? "—"} />
                        <StatusMeta k="News pending paused" v={sanityRun.news_pending_paused ?? "—"} />
                        <StatusMeta k="News pending rearmed" v={sanityRun.news_pending_rearmed ?? "—"} />
                        <StatusMeta k="News touch cancelled" v={sanityRun.news_touch_cancelled ?? "—"} />
                        <StatusMeta k="News fills blocked" v={sanityRun.news_fills_blocked ?? "—"} />
                        <StatusMeta k="News active flattened" v={sanityRun.news_active_trades_flattened ?? "—"} />
                        <StatusMeta k="News flattened R" v={sanityRun.news_flattened_r ?? "—"} />
                        <StatusMeta k="News flatten late" v={sanityRun.news_flatten_late_count ?? "—"} />
                        <StatusMeta k={sanityRun.duration_seconds != null ? "Duration" : "Elapsed"} v={formatSeconds(sanityRun.duration_seconds ?? sanityRun.elapsed_seconds)} />
                        <StatusMeta k="Imported run id" v={sanityRun.importedRunId || "—"} />
                        <StatusMeta k="Directional entry mode" v={sanityConfig.directional_entry_mode || cfg.directionalEntryMode || "symmetric"} />
                        {(sanityConfig.directional_entry_mode === "asymmetric" || cfg.directionalEntryMode === "asymmetric") && (
                            <>
                                <StatusMeta k="Long entry" v={formatDirEntryLabel(cfg.longEntryEnabled, cfg.longEntryModel, cfg.longPenetrationPct, cfg.longTriggeredEdgeThreshold, cfg.longTriggeredEdgeDelays)} />
                                <StatusMeta k="Short entry" v={formatDirEntryLabel(cfg.shortEntryEnabled, cfg.shortEntryModel, cfg.shortPenetrationPct, cfg.shortTriggeredEdgeThreshold, cfg.shortTriggeredEdgeDelays)} />
                            </>
                        )}
                    </div>
                </NeonPanel>
                </BuilderFocusCard>

                <BuilderFocusCard id="sidecar-run" activeId={activeBuilderCard} onActivate={setActiveBuilderCard} className="lg:col-span-3">
                <NeonPanel title="Local Sidecar Run" action={<Pill tone={runError ? "warning" : runStatusTone(runJob)}>{runStatusLabel(runJob)}</Pill>}>
                    <div className="mb-3 flex items-start gap-2 border border-[hsl(var(--warning)/0.35)] bg-[hsl(var(--warning)/0.06)] clip-bevel-sm px-3 py-2">
                        <ShieldAlert className="w-3.5 h-3.5 shrink-0 mt-0.5 text-[hsl(var(--warning))]" />
                        <span className="text-[11px] font-ui uppercase tracking-wider text-[hsl(var(--warning))]">Requires local sidecar running at http://127.0.0.1:8787.</span>
                    </div>
                    {runError && (
                        <div className="mb-3 border border-[hsl(var(--danger)/0.4)] bg-[hsl(var(--danger)/0.06)] clip-bevel-sm px-3 py-2 text-[11px] font-ui text-[hsl(var(--danger))]">
                            {runError}
                        </div>
                    )}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                        {/* Run status — primary column */}
                        <div>
                            <div className="panel-title-label text-[10px] font-ui uppercase tracking-[0.2em] text-title-lab mb-2">Run status</div>
                            {!runJob && (
                                <div className="border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2)/0.28)] clip-bevel-sm p-3 text-[11.5px] text-[hsl(var(--text-2))]">
                                    No local run started yet.
                                </div>
                            )}
                            {runJob && (
                                <div className="space-y-2">
                                    <div className={`border ${runStatusNoticeClass(runJob)} clip-bevel-sm px-3 py-2`}>
                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                            <div>
                                                <div className="control-label text-[10px] font-ui uppercase tracking-wider text-muted-lab">Structured run status</div>
                                                <div className="mt-1 text-[12px] font-ui text-white">
                                                    {runStatusLabel(runJob)} · {formatRunProgress(runJob)}
                                                </div>
                                            </div>
                                            <Pill tone={runStatusTone(runJob)}>{runStatusLabel(runJob)}</Pill>
                                        </div>
                                        <div className="mt-1 text-[11px] text-[hsl(var(--text-2))]">
                                            {runStatusMessage(runJob)}
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                        <StatusMeta k="Job ID" v={runJob.job_id} />
                                        <StatusMeta k="Run ID" v={runJob.run_id || runJob.job_id} />
                                        <StatusMeta k="Status" v={runJob.status} />
                                        <StatusMeta k="Subprocess" v={runJob.process_alive ? "running" : "stopped"} />
                                        <StatusMeta k="Progress" v={formatRunProgress(runJob)} />
                                        <StatusMeta k="Current scenario" v={runJob.current_label || "—"} />
                                        <StatusMeta k="Scenario kind" v={runJob.current_kind || "—"} />
                                        <StatusMeta k="Current output" v={runJob.current_output_file || "—"} />
                                        <StatusMeta k="ETA" v={formatDuration(runJob.eta_seconds)} />
                                        <StatusMeta k="Avg pass" v={formatDuration(runJob.avg_pass_seconds)} />
                                        <StatusMeta k={runJob.duration_seconds != null ? "Duration" : "Elapsed"} v={`${runJob.duration_seconds ?? runJob.elapsed_seconds ?? "—"}s`} />
                                        <StatusMeta k="Symbol" v={runJob.current_symbol || "—"} />
                                        <StatusMeta k="Execution mode" v={runJob.current_execution_mode || "—"} />
                                        <StatusMeta k="Protection mode" v={runJob.current_protection_mode || "—"} />
                                        <StatusMeta k="News blackout skipped" v={runJob.news_blackout_skipped ?? "—"} />
                                        <StatusMeta k="News events matched" v={runJob.news_events_matched ?? "—"} />
                                        <StatusMeta k="News windows created" v={runJob.news_windows_created ?? "—"} />
                                        <StatusMeta k="News pending paused" v={runJob.news_pending_paused ?? "—"} />
                                        <StatusMeta k="News pending rearmed" v={runJob.news_pending_rearmed ?? "—"} />
                                        <StatusMeta k="News touch cancelled" v={runJob.news_touch_cancelled ?? "—"} />
                                        <StatusMeta k="News fills blocked" v={runJob.news_fills_blocked ?? "—"} />
                                        <StatusMeta k="News active flattened" v={runJob.news_active_trades_flattened ?? "—"} />
                                        <StatusMeta k="News flattened R" v={runJob.news_flattened_r ?? "—"} />
                                        <StatusMeta k="News flatten late" v={runJob.news_flatten_late_count ?? "—"} />
                                        <StatusMeta k="Output folder" v={runJob.output_folder || "—"} />
                                    </div>
                                    {runJob.possibly_stalled && (
                                        <div className="border border-[hsl(var(--warning)/0.45)] bg-[hsl(var(--warning)/0.07)] clip-bevel-sm px-3 py-2 text-[10.5px] text-[hsl(var(--warning))]">
                                            No progress update for {formatDuration(runJob.seconds_since_update)}. The run may be stalled.
                                        </div>
                                    )}
                                    {runJob.can_cancel && (
                                        <div className="flex justify-end">
                                            <NeonButton icon={Trash2} tone="warning" onClick={onCancelRun} disabled={runBusy}>
                                                Cancel Run
                                            </NeonButton>
                                        </div>
                                    )}
                                    {isCompletedRun(runJob) && (
                                        <div className="space-y-2 border border-[hsl(var(--success)/0.35)] bg-[hsl(var(--success)/0.06)] clip-bevel-sm px-3 py-2">
                                            <div className="text-[11px] font-ui text-[hsl(var(--success))]">
                                                Run completed. Import the completed output folder into Research Lab.
                                            </div>
                                            <div className="flex flex-wrap items-center gap-2">
                                                <NeonButton icon={FileInput} tone="success" onClick={onImportCompletedRun} disabled={importBusy}>
                                                    {importBusy ? "Importing..." : "Import Completed Run"}
                                                </NeonButton>
                                                {importedRunId && (
                                                    <>
                                                        <Pill tone="success">Imported</Pill>
                                                        <Link to={`/runs/${encodeURIComponent(importedRunId)}`}><NeonButton tone="primary">Open Run</NeonButton></Link>
                                                        <Link to="/runs"><NeonButton tone="ghost">All Runs</NeonButton></Link>
                                                        <Link to="/strategy-map"><NeonButton tone="ghost">Strategy Map</NeonButton></Link>
                                                        <Link to="/trade-inspector"><NeonButton tone="ghost">Trade Inspector</NeonButton></Link>
                                                    </>
                                                )}
                                            </div>
                                            {importError && (
                                                <div className="border border-[hsl(var(--danger)/0.4)] bg-[hsl(var(--danger)/0.06)] clip-bevel-sm px-2 py-1.5 text-[10.5px] font-ui text-[hsl(var(--danger))]">
                                                    {importError}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                    <LogBlock title="stdout tail" text={runJob.stdout_tail} />
                                    <LogBlock title="stderr tail" text={runJob.stderr_tail} tone="warning" />
                                </div>
                            )}
                        </div>
                        {/* Generated config — secondary column, collapsed by default */}
                        <div>
                            <div className="flex items-center justify-between mb-2">
                                <div className="panel-title-label text-[10px] font-ui uppercase tracking-[0.2em] text-title-lab">Generated Config</div>
                                <button
                                    onClick={() => setShowConfig((v) => !v)}
                                    className="flex items-center gap-1 control-label text-[10px] font-ui text-muted-lab hover:text-white transition-colors"
                                    aria-label="Toggle generated config"
                                >
                                    <span>{showConfig ? "Hide" : "Show"}</span>
                                    {showConfig ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                                </button>
                            </div>
                            {showConfig && (
                                <pre className="max-h-80 overflow-auto scrollbar-thin whitespace-pre-wrap border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2)/0.35)] clip-bevel-sm p-3 text-[10.5px] leading-relaxed font-code text-[hsl(var(--accent-secondary))]">
                                    {JSON.stringify(sidecarConfig, null, 2)}
                                </pre>
                            )}
                        </div>
                    </div>
                </NeonPanel>
                </BuilderFocusCard>
            </div>

            <div className="mx-6 mt-4 flex items-center gap-2 border border-[hsl(var(--warning)/0.4)] bg-[hsl(var(--warning)/0.06)] clip-bevel-sm px-3 py-2">
                <ShieldAlert className="w-3.5 h-3.5 text-[hsl(var(--warning))]" />
                <span className="text-[11px] font-ui uppercase tracking-wider text-[hsl(var(--warning))]">Research only · this builder does NOT place orders</span>
            </div>
        </div>
    );
}

function BuilderFocusCard({ id, activeId, onActivate, className = "", children }) {
    const active = id === activeId;
    return (
        <div
            className={[
                "flex flex-col transition-[outline-color,box-shadow] duration-150 outline outline-1 outline-transparent",
                active ? "outline-cyan-300 shadow-[0_0_0_1px_rgba(34,211,238,0.72),0_0_28px_rgba(34,211,238,0.20)]" : "",
                className,
            ].filter(Boolean).join(" ")}
            onMouseDown={() => onActivate(id)}
            onFocusCapture={() => onActivate(id)}
        >
            {children}
        </div>
    );
}

function readStoredJson(key) {
    try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

function writeStoredJson(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value || {}));
    } catch {
        // Keep Strategy Builder usable even if storage is unavailable.
    }
}

function reduceRunSnapshot(job, importedRunId = "") {
    if (!job) return {};
    return {
        job_id: job.job_id,
        run_id: job.run_id,
        status: job.status,
        output_folder: job.output_folder,
        duration_seconds: job.duration_seconds,
        elapsed_seconds: job.elapsed_seconds,
        progress: job.progress,
        current_label: job.current_label,
        current_kind: job.current_kind,
        current_index: job.current_index,
        total_passes: job.total_passes,
        current_threshold_pct: job.current_threshold_pct,
        current_output_file: job.current_output_file,
        completed_passes: job.completed_passes,
        progress_elapsed_seconds: job.progress_elapsed_seconds,
        eta_seconds: job.eta_seconds,
        avg_pass_seconds: job.avg_pass_seconds,
        seconds_since_update: job.seconds_since_update,
        possibly_stalled: job.possibly_stalled,
        can_cancel: job.can_cancel,
        process_alive: job.process_alive,
        scenario_plan_summary: job.scenario_plan_summary,
        current_symbol: job.current_symbol,
        current_execution_mode: job.current_execution_mode,
        current_protection_mode: job.current_protection_mode,
        news_blackout_skipped: job.news_blackout_skipped,
        news_events_matched: job.news_events_matched,
        news_windows_created: job.news_windows_created,
        news_pending_paused: job.news_pending_paused,
        news_pending_rearmed: job.news_pending_rearmed,
        news_touch_cancelled: job.news_touch_cancelled,
        news_fills_blocked: job.news_fills_blocked,
        news_active_trades_flattened: job.news_active_trades_flattened,
        news_flattened_r: job.news_flattened_r,
        news_flatten_late_count: job.news_flatten_late_count,
        session_filtered_skipped: job.session_filtered_skipped,
        structure_direction_filter_skipped: job.structure_direction_filter_skipped ?? null,
        created_at: job.created_at,
        started_at: job.started_at,
        finished_at: job.finished_at,
        importedRunId: importedRunId || job.importedRunId || "",
    };
}

function estimateScenarioPlan(config) {
    const executionModes = Array.isArray(config?.execution_modes) && config.execution_modes.length
        ? config.execution_modes
        : ["single_position"];
    const protectionModes = Array.isArray(config?.protection_modes) && config.protection_modes.length
        ? config.protection_modes
        : ["baseline"];
    const penetrationThresholds = Array.isArray(config?.penetration_thresholds) ? config.penetration_thresholds : [];
    const closeBuffers = Array.isArray(config?.close_breach_buffers_pips) ? config.close_breach_buffers_pips : [];
    const entryModels = Array.isArray(config?.entry_models) ? config.entry_models : ["baseline"];
    const entryThresholds = Array.isArray(config?.entry_penetration_thresholds) ? config.entry_penetration_thresholds : [];
    const triggeredThresholds = Array.isArray(config?.triggered_edge_trigger_thresholds) ? config.triggered_edge_trigger_thresholds : [];
    const triggeredModes = Array.isArray(config?.triggered_edge_same_candle_modes) && config.triggered_edge_same_candle_modes.length
        ? config.triggered_edge_same_candle_modes
        : ["same_candle", "next_candle"];
    let baseline = 0;
    let protection = 0;
    for (const mode of protectionModes) {
        if (mode === "baseline") baseline += 1;
        else if (mode === "penetration_threshold_exit") protection += Math.max(1, penetrationThresholds.length);
        else if (mode === "close_confirmed_ob_breach_exit") protection += Math.max(1, closeBuffers.length);
        else protection += 1;
    }
    const penetrationEntry = entryModels.includes("entry_penetration") ? entryThresholds.length : 0;
    const triggeredEntry = entryModels.includes("triggered_edge") ? triggeredThresholds.length * triggeredModes.length : 0;
    const entry = penetrationEntry + triggeredEntry;
    return {
        baseline: baseline * executionModes.length,
        protection: protection * executionModes.length,
        entry: entry * executionModes.length,
        totalPasses: (baseline + protection + entry) * executionModes.length,
    };
}

function formatRunProgress(job) {
    if (!job) return "—";
    const current = job.current_index;
    const total = job.total_passes;
    if (current != null && total != null) return `${current} / ${total}`;
    return "—";
}

function isCompletedRun(job) {
    return job?.status === "completed" || job?.status === "succeeded";
}

function runStatusLabel(job) {
    const status = String(job?.status || "ready").toLowerCase();
    if (status === "completed" || status === "succeeded") return "Completed";
    if (status === "cancelled") return "Cancelled";
    if (status === "failed") return "Failed";
    if (status === "running") return "Running";
    if (status === "queued") return "Queued";
    return "Ready";
}

function runStatusTone(job) {
    const status = String(job?.status || "").toLowerCase();
    if (status === "completed" || status === "succeeded") return "success";
    if (status === "failed" || status === "cancelled") return "warning";
    if (status === "running" || status === "queued") return "secondary";
    return "muted";
}

function runStatusNoticeClass(job) {
    const status = String(job?.status || "").toLowerCase();
    if (status === "completed" || status === "succeeded") {
        return "border-[hsl(var(--success)/0.35)] bg-[hsl(var(--success)/0.06)]";
    }
    if (status === "failed" || status === "cancelled") {
        return "border-[hsl(var(--warning)/0.45)] bg-[hsl(var(--warning)/0.07)]";
    }
    return "border-[hsl(var(--accent-secondary)/0.28)] bg-[hsl(var(--accent-secondary)/0.06)]";
}

function runStatusMessage(job) {
    const status = String(job?.status || "").toLowerCase();
    if (status === "cancelled") return "Run cancelled. You can start another run.";
    if (status === "failed") return "Run failed. Review stderr tail for details before rerunning.";
    if (status === "completed" || status === "succeeded") return "Run completed. Import the completed output folder into Research Lab.";
    if (status === "queued") return "Run queued. Waiting for the local sidecar runner.";
    if (status === "running") {
        const label = job?.current_label ? ` Current scenario: ${job.current_label}.` : "";
        return `Run is active.${label}`;
    }
    return "No local run started yet.";
}

function copyJsonToClipboard(value, showFlash, label) {
    const text = JSON.stringify(value || {}, null, 2);
    if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) return;
    navigator.clipboard.writeText(text).then(() => showFlash(label)).catch(() => {});
}

function mapBuilderStructureFilter(value) {
    const text = String(value || "").toLowerCase();
    if (text.includes("choch") || text.includes("change")) return "choch";
    if (text.includes("bos")) return "bos";
    return "both";
}

function formatStructureFilter(value) {
    const text = String(value || "both").toLowerCase();
    if (text === "bos") return "BOS";
    if (text === "choch") return "CHoCH";
    return "Both";
}

function formatExecutionMode(value) {
    const text = String(value || "");
    if (!text) return "—";
    if (text === "allow_multi_position" || text === "multi_position") return "Multi";
    if (text === "single_position") return "Single";
    if (text === "one_per_direction") return "One/Dir";
    return text;
}

function disabledSessionsFromConfig(config) {
    if (!config?.session_filter_enabled) return [];
    const allowed = new Set(config.allowed_sessions || []);
    return ["Asia", "London", "London Lull", "New York", "Outside"].filter((session) => !allowed.has(session));
}

function formatNewsWindow(config) {
    const before = config?.news_blackout_minutes_before;
    const after = config?.news_blackout_minutes_after;
    if (before == null && after == null) return "—";
    return `${before ?? "—"}m before / ${after ?? "—"}m after`;
}

function formatEntryResearchExports(config) {
    const models = Array.isArray(config?.entry_models) ? config.entry_models : [];
    if (!models.length) return "—";
    const thresholds = Array.isArray(config?.entry_penetration_thresholds) ? config.entry_penetration_thresholds : [];
    if (!models.includes("entry_penetration")) return "baseline only";
    const mode = thresholds.length === 2 && thresholds.includes(25) && thresholds.includes(50)
        ? "light"
        : thresholds.length === 4 && thresholds.includes(10) && thresholds.includes(25) && thresholds.includes(50) && thresholds.includes(75)
        ? "full"
        : "custom";
    return `baseline + penetration (${mode})`;
}

function formatEntryModels(config) {
    const models = Array.isArray(config?.entry_models) ? config.entry_models : [];
    if (!models.length) return "—";
    const labels = models.map((model) => ({
        baseline: "Baseline edge",
        entry_penetration: "Penetration",
        triggered_edge: "Triggered edge",
    }[model] || model));
    return labels.join(" + ");
}

function formatTriggeredEdgeModes(modes) {
    const values = ensureArray(modes).map((mode) => String(mode).trim().toLowerCase());
    if (!values.length) return "—";
    const hasSame = values.includes("same_candle");
    const hasNext = values.includes("next_candle");
    if (hasSame && hasNext) return "Delay 0+1 (same + next)";
    if (hasSame) return "Delay 0 (same candle)";
    if (hasNext) return "Delay 1 (next candle)";
    return values.join(", ");
}

function formatTriggeredEdgeDelays(delays, legacyModes) {
    // Prefer the new numeric array field
    if (Array.isArray(delays) && delays.length) {
        const sorted = [...delays].sort((a, b) => a - b);
        if (sorted.length === 1) {
            const d = sorted[0];
            if (d === 0) return "Delay 0 (same)";
            if (d === 1) return "Delay 1 (next)";
            return `Delay ${d}`;
        }
        return `Delays ${sorted.join("+")}`;
    }
    // Fallback to legacy string array
    return formatTriggeredEdgeModes(legacyModes);
}

function formatTriggeredEdgeRetraceCancel(config) {
    if (!config?.triggered_edge_cancel_on_retrace) return "Off";
    const pips = formatPipValue(config.triggered_edge_cancel_retrace_pips);
    const pct = formatPercentValue(config.triggered_edge_cancel_retrace_ob_pct);
    return `On · ${pips} / ${pct}`;
}

function formatSeconds(value) {
    return value == null ? "—" : `${value}s`;
}

function formatDuration(value) {
    const seconds = Number(value);
    if (!Number.isFinite(seconds) || seconds < 0) return "—";
    if (seconds < 60) return `${Math.round(seconds)}s`;
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    if (hours > 0) return `~${hours}h ${remainingMinutes}m`;
    return `~${minutes}m`;
}

function formatNumberValue(value) {
    if (value == null || value === "") return "—";
    const n = Number(value);
    return Number.isFinite(n) ? String(n) : "—";
}

function formatPercentValue(value) {
    const formatted = formatNumberValue(value);
    return formatted === "—" ? formatted : `${formatted}%`;
}

function formatPipValue(value) {
    const formatted = formatNumberValue(value);
    if (formatted === "—") return formatted;
    return `${formatted} ${Number(formatted) === 1 ? "pip" : "pips"}`;
}

function formatTickValue(value) {
    const formatted = formatNumberValue(value);
    if (formatted === "—") return formatted;
    return `${formatted} ${Number(formatted) === 1 ? "tick" : "ticks"}`;
}

function formatLoadRunLabel(run) {
    if (!run) return "Unknown run";
    const config = run.config || {};
    const summary = run.summary || {};
    const symbol = config.symbol || summary.symbol || "—";
    const tf = mapConfigDetectionTf(config.detection_timeframe || config.detection_tf || summary.detectionTf || summary.detection_tf || "");
    const from = normalizeDateValue(config.start_date || config.date_from || summary.dateFrom || summary.date_from);
    const to = normalizeDateValue(config.end_date || config.date_to || summary.dateTo || summary.date_to);
    const range = from && to ? `${from} → ${to}` : "";
    return [getRunDisplayName(run), symbol, tf, range].filter(Boolean).join(" · ");
}

function LabelWithTooltip({ label, help }) {
    return (
        <span className="relative inline-flex items-center gap-1.5 group/help">
            <span>{label}</span>
            <span className="inline-flex items-center justify-center text-[hsl(var(--accent-secondary))]">
                <HelpCircle className="w-3.5 h-3.5" />
            </span>
            <span className="pointer-events-none absolute left-0 top-full z-30 mt-2 hidden w-80 max-w-[70vw] whitespace-pre-line clip-bevel-sm border border-[hsl(var(--accent-secondary)/0.45)] bg-[hsl(var(--panel))] px-3 py-2 text-left text-[10.5px] normal-case leading-relaxed tracking-normal text-[hsl(var(--text-2))] shadow-[0_0_24px_-10px_hsl(var(--accent-secondary))] group-hover/help:block group-focus-within/help:block">
                {help}
            </span>
        </span>
    );
}

function formatSidecarError(error) {
    const message = error?.message || String(error || "Sidecar request failed");
    if (message === "[object Object]") return "A backtest is already running.";
    if (message.toLowerCase().includes("failed to fetch")) {
        return "Sidecar offline. Start it at http://127.0.0.1:8787 and try again.";
    }
    return message;
}

function structureChipLabel(value) {
    const v = formatStructureFilter(value);
    if (v === "Both") return "BOS+CHOCH";
    if (v === "CHoCH") return "CHOCH";
    return "BOS";
}

function structureDirectionRibbonLabel(cfg) {
    const all = buildAllowedStructureDirections(cfg);
    // Full set or empty — fall back to coarse label
    if (all.length === 0 || all.length === 4) return structureChipLabel(cfg.structure);
    const hasBosL   = all.includes("bos_long");
    const hasBosS   = all.includes("bos_short");
    const hasChochL = all.includes("choch_long");
    const hasChochS = all.includes("choch_short");
    const parts = [];
    if (hasBosL  && hasBosS)  parts.push("BOS");
    else if (hasBosL)         parts.push("BOS L");
    else if (hasBosS)         parts.push("BOS S");
    if (hasChochL && hasChochS) parts.push("CHOCH");
    else if (hasChochL)         parts.push("CHOCH L");
    else if (hasChochS)         parts.push("CHOCH S");
    return parts.join("+") || "NONE";
}

function directionChipLabel(value) {
    const v = mapConfigDirection(value);
    if (v === "Both") return "Long+Short";
    return v;
}

// Compact display snapshot of a run's config — used by the recall cards/preview.
function runConfigPreview(run) {
    if (!run) return null;
    const source = { ...(run.summary || {}), ...(run.config || {}) };
    const rr = toNumber(source.rr_multiple ?? source.rr ?? source.risk_reward);
    const from = normalizeDateValue(source.start_date || source.date_from || source.dateFrom);
    const to = normalizeDateValue(source.end_date || source.date_to || source.dateTo);
    return {
        name: getRunDisplayName(run),
        date: normalizeDateValue(run.importedAt || source.importedAt || source.createdAt) || "",
        symbol: source.symbol || "—",
        detectionTf: mapConfigDetectionTf(source.detection_timeframe || source.detection_tf || source.detectionTf || "M15"),
        executionTf: mapConfigExecutionTf(source.execution_timeframe || source.execution_tf || source.executionTf || "1m"),
        structure: structureChipLabel(source.structure ?? source.structure_filter ?? source.allowed_structures),
        direction: directionChipLabel(source.direction ?? source.trade_direction ?? source.allowed_directions),
        rr: rr != null ? rr : null,
        executionMode: formatExecutionMode(mapConfigExecutionMode(source.execution_modes ?? source.executionMode ?? source.execution_mode)),
        entryModel: formatEntryModels(source),
        dateRange: from && to ? `${from} → ${to}` : (from || to || ""),
    };
}

// Strategy identity snapshot rendered as compact chip groups.
function ConfigSnapshot({ preview, className = "" }) {
    if (!preview) return null;
    const groups = [
        [preview.symbol, preview.entryModel].filter(Boolean).join(" · "),
        `${preview.detectionTf} → ${preview.executionTf}`,
        [preview.structure, preview.direction].filter(Boolean).join(" · "),
        [preview.rr != null ? `RR ${preview.rr}` : null, preview.executionMode].filter(Boolean).join(" · "),
        preview.dateRange,
    ].filter(Boolean);
    return (
        <div className={`flex items-center gap-1.5 flex-wrap ${className}`}>
            {groups.map((g, i) => (
                <span
                    key={i}
                    className="clip-bevel-sm border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2)/0.4)] px-2 py-0.5 text-[10px] font-ui uppercase tracking-wider text-[hsl(var(--text-2))]"
                >
                    {g}
                </span>
            ))}
        </div>
    );
}

// Subtle top-right ribbon reflecting the builder's current active config identity.
function ConfigScopeRibbon({ cfg }) {
    const model = cfg.entryMode === "research"
        ? "RESEARCH"
        : ({ baseline: "BASELINE", entry_penetration: "PENETRATION", triggered_edge: "TRIGGERED EDGE" }[cfg.selectedEntryModel] || "BASELINE");
    const rr = Number(cfg.rr);
    const chips = [
        model,
        cfg.directionalEntryMode === "asymmetric" ? "ASYMMETRIC" : null,
        structureDirectionRibbonLabel(cfg).toUpperCase(),
        directionChipLabel(cfg.direction).toUpperCase(),
        Number.isFinite(rr) ? `RR ${rr}` : null,
        formatExecutionMode(cfg.executionMode).toUpperCase(),
    ].filter(Boolean);
    return (
        <div className="flex items-center gap-1.5 flex-wrap justify-end">
            <span className="control-label text-[9px] font-ui uppercase tracking-[0.14em] text-muted-lab mr-0.5">Active Config</span>
            {chips.map((c) => (
                <span
                    key={c}
                    className="clip-bevel-sm border border-[hsl(var(--accent-secondary)/0.28)] bg-[hsl(var(--accent-secondary)/0.06)] px-2 py-0.5 text-[9.5px] font-ui uppercase tracking-wider text-[hsl(var(--accent-secondary))]"
                >
                    {c}
                </span>
            ))}
        </div>
    );
}

function StatusMeta({ k, v }) {
    return (
        <div className="border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2)/0.28)] clip-bevel-sm px-3 py-2">
            <div className="control-label text-[9.5px] font-ui uppercase tracking-wider text-muted-lab">{k}</div>
            <div className="mt-1 text-[11px] font-code text-[hsl(var(--text-2))] break-all">{String(v ?? "—")}</div>
        </div>
    );
}

function formatDirEntryLabel(enabled, model, penetrationPct, triggeredEdgeThreshold, delays) {
    if (!enabled) return "Disabled";
    if (model === "baseline") return "Baseline";
    if (model === "entry_penetration") return `Penetration ${penetrationPct}%`;
    if (model === "triggered_edge") {
        const delayArr = Array.isArray(delays) ? delays : [0, 1];
        const delayLabel = delayArr.map((d) => d === 0 ? "Same" : d === 1 ? "Next" : `+${d}`).join(" / ");
        return `TE ${triggeredEdgeThreshold}% · ${delayLabel}`;
    }
    return model || "—";
}

function DirectionalEntryCard({ label, enabled, entryModel, penetrationPct, triggeredEdgeThreshold, triggeredEdgeDelays, onChange }) {
    const delays = Array.isArray(triggeredEdgeDelays) ? triggeredEdgeDelays : [0, 1];
    return (
        <div className="border border-[hsl(var(--border-soft))] clip-bevel-sm p-3 space-y-3">
            <div className="flex items-center justify-between">
                <div className="control-label text-[11px] font-ui uppercase tracking-wider text-muted-lab">{label}</div>
                <NeonToggle checked={enabled} onChange={(val) => onChange("EntryEnabled", val)} />
            </div>
            {enabled && (
                <>
                    <Segment
                        options={[
                            { value: "baseline", label: "Baseline" },
                            { value: "entry_penetration", label: "Penetration" },
                            { value: "triggered_edge", label: "TE" },
                        ]}
                        value={entryModel}
                        onChange={(val) => onChange("EntryModel", val)}
                    />
                    {entryModel === "entry_penetration" && (
                        <Field label="Penetration %">
                            <NeonInput
                                type="number"
                                min="1"
                                max="99"
                                step="1"
                                value={penetrationPct}
                                onChange={(e) => onChange("PenetrationPct", Number(e.target.value))}
                            />
                        </Field>
                    )}
                    {entryModel === "triggered_edge" && (
                        <div className="space-y-2">
                            <Field label="Trigger Threshold %">
                                <NeonInput
                                    type="number"
                                    min="1"
                                    max="99"
                                    step="1"
                                    value={triggeredEdgeThreshold}
                                    onChange={(e) => onChange("TriggeredEdgeThreshold", Number(e.target.value))}
                                />
                            </Field>
                            <Field label="Entry Delay" hint="0=same · 1=next · 2/3=deferred">
                                <div className="flex gap-1.5">
                                    {[{ d: 0, label: "0·S" }, { d: 1, label: "1·N" }, { d: 2, label: "2" }, { d: 3, label: "3" }].map(({ d, label }) => {
                                        const active = delays.includes(d);
                                        return (
                                            <button
                                                key={d}
                                                type="button"
                                                onClick={() => {
                                                    const next = active
                                                        ? delays.filter((x) => x !== d)
                                                        : [...delays, d].sort((a, b) => a - b);
                                                    if (next.length === 0) return;
                                                    onChange("TriggeredEdgeDelays", next);
                                                }}
                                                className={[
                                                    "px-2 py-1 text-[10px] font-ui uppercase tracking-[0.08em] clip-bevel-sm border transition-colors",
                                                    active
                                                        ? "border-[hsl(var(--accent-primary)/0.7)] bg-[hsl(var(--accent-primary)/0.12)] text-[hsl(var(--accent-primary))]"
                                                        : "border-[hsl(var(--border-soft))] bg-transparent text-[hsl(var(--text-2)/0.5)] hover:text-[hsl(var(--text-2))]",
                                                ].join(" ")}
                                            >
                                                {label}
                                            </button>
                                        );
                                    })}
                                </div>
                            </Field>
                            <div className="text-[10px] text-muted-lab italic border border-[hsl(var(--border-soft))] clip-bevel-sm px-2 py-1">
                                Retrace cancel and first-failed-tag settings apply globally — configure in Entry Protection above.
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

function LogBlock({ title, text, tone = "secondary" }) {
    if (!text) return null;
    const toneClass = tone === "warning" ? "text-[hsl(var(--warning))]" : "text-[hsl(var(--accent-secondary))]";
    return (
        <div>
            <div className="mb-1 control-label text-[9.5px] font-ui uppercase tracking-wider text-muted-lab">{title}</div>
            <pre className={`max-h-52 overflow-auto scrollbar-thin whitespace-pre-wrap border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel)/0.65)] clip-bevel-sm p-2 text-[10.5px] leading-relaxed font-code ${toneClass}`}>{text}</pre>
        </div>
    );
}
