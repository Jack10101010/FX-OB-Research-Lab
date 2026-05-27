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

const LAST_CONFIG_KEY = "fxob_strategy_builder_last_config";
const LAST_RUN_KEY = "fxob_strategy_builder_last_run";

export default function StrategyBuilder() {
    const { PROJECTS, ACTIVE_PROJECT, RUNS, activeProjectId, getRunData } = useDataset();
    const [cfg, setCfg] = useState({
        symbol: "EURUSD",
        detectionTf: "M15",
        executionTf: "1m",
        dateFrom: "2026-02-18",
        dateTo: "2026-05-18",
        dataFile: "data/candles/EURUSD_1m.csv",
        swing: 50,
        obFilter: "ATR",
        minObSizePips: 0,
        maxObSizePips: 100,
        structure: "Both",
        direction: "Both",
        rr: 3.3,
        obEntryDepthPct: 0,
        entryBuffer: 0.0,
        stopBuffer: 1.0,
        verifyTicks: 0,
        executionMode: "multi_position",
        conflict: "Allow Auto Reversal",
        cancelAction: "Kill OB",
        sessionFilter: true,
        london: true, lull: false, newYork: true, asia: false, outside: false,
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
        monteCarlo: false,
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
    const [lastConfig, setLastConfig] = useState(() => readStoredJson(LAST_CONFIG_KEY));
    const [lastRun, setLastRun] = useState(() => readStoredJson(LAST_RUN_KEY));
    const didHydrateConfig = useRef(false);
    const showFlash = (msg) => { setFlash(msg); setTimeout(() => setFlash(""), 1800); };
    const sidecarConfig = useMemo(() => buildBacktesterConfig(cfg), [cfg]);
    const allowedSessions = useMemo(() => selectedAllowedSessions(cfg), [cfg]);
    const sessionSelectionWarning = Boolean(cfg.sessionFilter) && allowedSessions.length === 0;
    const sanityConfig = sidecarConfig || lastConfig || {};
    const sanityRun = runJob ? reduceRunSnapshot(runJob, importedRunId) : (lastRun || {});
    const generatedPlan = useMemo(() => estimateScenarioPlan(sidecarConfig), [sidecarConfig]);
    const runInProgress = ["queued", "running"].includes(runJob?.status);
    const selectedLoadRun = loadRunId ? getRunData(loadRunId) : null;
    const selectedLoadProject = selectedLoadRun?.projectId
        ? PROJECTS.find((project) => project.id === selectedLoadRun.projectId)
        : null;

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
        showFlash(`Project created · ${project.name}`);
    };
    const onLoadFromRun = () => {
        if (!selectedLoadRun) return;
        const report = buildRunConfigLoadReport(cfg, selectedLoadRun);
        setCfg(report.config);
        setLoadedRunId(selectedLoadRun.id);
        setLoadReport(report);
        showFlash(`Loaded settings from ${getRunDisplayName(selectedLoadRun)}`);
    };
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
            const started = await startSidecarRun(sidecarConfig);
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
                    <>
                        <NeonButton icon={Play} tone="primary" onClick={onRunLocal} disabled={runBusy || runInProgress} data-testid="builder-run-backtest">
                            {runBusy ? "Starting..." : runInProgress ? "Running..." : "Run Backtest Locally"}
                        </NeonButton>
                    </>
                }
            />

            <div className="px-6 mb-4">
                <div className="clip-bevel p-[1px] bg-gradient-to-r from-[hsl(var(--border-mid))] via-[hsl(var(--accent-secondary)/0.25)] to-[hsl(var(--border-mid))]">
                    <div className="clip-bevel bg-[hsl(var(--panel))] px-4 py-3 flex items-center gap-3 flex-wrap">
                        <div className="min-w-[260px]">
                            <div className="control-label text-[10px] font-mono uppercase tracking-[0.22em] text-muted-lab">
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

            <div className="px-6 mb-4">
                <div className="clip-bevel p-[1px] bg-gradient-to-r from-[hsl(var(--border-mid))] via-[hsl(var(--accent-secondary)/0.18)] to-[hsl(var(--border-mid))]">
                    <div className="clip-bevel bg-[hsl(var(--panel))] px-4 py-3 flex items-center gap-3 flex-wrap">
                        <div className="min-w-[220px]">
                            <div className="control-label text-[10px] font-mono uppercase tracking-[0.22em] text-muted-lab">
                                Load From Run
                            </div>
                            <div className="text-[10.5px] text-muted-lab">
                                Reuse saved config from an imported or sidecar run.
                            </div>
                        </div>
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
                            Load Settings
                        </NeonButton>
                        {selectedLoadProject && selectedLoadProject.id !== activeProjectId && (
                            <NeonButton tone="ghost" onClick={() => setActiveProjectId(selectedLoadProject.id)}>
                                Use This Run&apos;s Project
                            </NeonButton>
                        )}
                        {selectedLoadProject && (
                            <Pill tone="secondary">Run belongs to: {selectedLoadProject.name}</Pill>
                        )}
                        {loadedRunId && (
                            <div className="basis-full text-[10.5px] text-[hsl(var(--accent-secondary))]">
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
            </div>

            <div className="px-6 grid grid-cols-1 lg:grid-cols-3 gap-4">
                <NeonPanel title="Basic Settings">
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

                <NeonPanel title="Structure Settings">
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
                        <Field label="Structure Type" className="col-span-2">
                            <Segment options={["BOS", "CHoCH", "Both"]} value={cfg.structure} onChange={set("structure")} />
                        </Field>
                        <Field label="Trade Direction" className="col-span-2">
                            <Segment options={["Long", "Short", "Both"]} value={cfg.direction} onChange={set("direction")} />
                        </Field>
                    </div>
                </NeonPanel>

                <NeonPanel title="Execution Settings">
                    <div className="grid grid-cols-2 gap-3">
                        <Field label="RR Multiple">
                            <NeonInput data-testid="bld-rr" type="number" step="0.1" value={cfg.rr} onChange={(e) => set("rr")(Number(e.target.value))} />
                        </Field>
                        <Field
                            label="Entry Depth"
                            help="Moves entry deeper into OB. Stop stays fixed. TP recalculates from new risk."
                            className="col-span-2"
                        >
                            <Segment
                                options={[
                                    { value: 0, label: "Edge" },
                                    { value: 25, label: "25%" },
                                    { value: 50, label: "50%" },
                                    { value: 75, label: "75%" },
                                    { value: 100, label: "100%" },
                                ]}
                                value={Number(cfg.obEntryDepthPct || 0)}
                                onChange={(value) => set("obEntryDepthPct")(Number(value))}
                            />
                            <div className="mt-1 text-[10.5px] text-muted-lab">
                                Moves entry deeper into OB. Stop stays fixed. TP recalculates from new risk.
                            </div>
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

                <NeonPanel title="Filters" className="lg:col-span-2">
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
                                        className={`clip-bevel-sm px-2.5 py-1 text-[11px] font-mono uppercase tracking-wider border transition-colors ${
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
                                <div className="mb-4 border border-[hsl(var(--warning)/0.4)] bg-[hsl(var(--warning)/0.06)] clip-bevel-sm px-3 py-2 text-[10.5px] font-mono uppercase tracking-wider text-[hsl(var(--warning))]">
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
                                            <div className="control-label text-[11px] font-mono uppercase tracking-wider text-muted-lab">News Blackout</div>
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
                                            <div className="control-label mb-2 text-[11px] font-mono uppercase tracking-wider text-muted-lab">Impacts</div>
                                            <div className="flex flex-wrap gap-2">
                                                {["low", "medium", "high"].map((impact) => (
                                                    <button
                                                        key={impact}
                                                        onClick={() => toggleNewsImpact(impact)}
                                                        className={`clip-bevel-sm px-2.5 py-1 text-[11px] font-mono uppercase tracking-wider border transition-colors ${
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
                                                    <div className="control-label text-[11px] font-mono uppercase tracking-wider text-muted-lab">Pause Pending Orders</div>
                                                    <div className="text-[10px] text-muted-lab">Suspend unfilled OBs during blackout; rearm after</div>
                                                </div>
                                                <NeonToggle checked={cfg.newsPausePending} onChange={set("newsPausePending")} />
                                            </div>
                                            <div className="flex items-center justify-between gap-3">
                                                <div>
                                                    <div className="control-label text-[11px] font-mono uppercase tracking-wider text-muted-lab">Block New Fills</div>
                                                    <div className="text-[10px] text-muted-lab">Prevent entry fills while inside blackout window</div>
                                                </div>
                                                <NeonToggle checked={cfg.newsBlockFills} onChange={set("newsBlockFills")} />
                                            </div>
                                            <div className="flex items-center justify-between gap-3">
                                                <div>
                                                    <div className="control-label text-[11px] font-mono uppercase tracking-wider text-muted-lab">Cancel If Touched (blackout)</div>
                                                    <div className="text-[10px] text-muted-lab">Export NEWS_TOUCH_CANCEL if paused OB is touched</div>
                                                </div>
                                                <NeonToggle checked={cfg.newsCancelIfTouched} onChange={set("newsCancelIfTouched")} />
                                            </div>
                                            <div className="flex items-center justify-between gap-3">
                                                <div>
                                                    <div className="control-label text-[11px] font-mono uppercase tracking-wider text-muted-lab">Flatten Active Trades</div>
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

                <NeonPanel title="Advanced">
                    <div className="grid grid-cols-2 gap-3">
                        <Field label="Spread (pips)"><NeonInput type="number" step="0.05" value={cfg.spread} onChange={(e) => set("spread")(Number(e.target.value))} /></Field>
                        <Field label="Slippage (pips)"><NeonInput type="number" step="0.05" value={cfg.slippage} onChange={(e) => set("slippage")(Number(e.target.value))} /></Field>
                        <Field label="Commission (R/trade)" className="col-span-2"><NeonInput type="number" step="0.01" value={cfg.commission} onChange={(e) => set("commission")(Number(e.target.value))} /></Field>
                        <Field label="Entry Research Exports" className="col-span-2" hint="Light is the default for long research runs. Full can be slow on multi-month datasets.">
                            <NeonSelect
                                value={resolveEntryExportMode(cfg)}
                                onChange={(value) => {
                                    if (value === "off") {
                                        setCfg((current) => ({ ...current, entryResearchExportMode: "off", entryResearchExports: false, entryPenetrationThresholds: "" }));
                                    } else if (value === "full") {
                                        setCfg((current) => ({ ...current, entryResearchExportMode: "full", entryResearchExports: true, entryPenetrationThresholds: "10,25,50,75" }));
                                    } else {
                                        setCfg((current) => ({ ...current, entryResearchExportMode: "light", entryResearchExports: true, entryPenetrationThresholds: "25,50" }));
                                    }
                                }}
                                options={[
                                    { value: "off", label: "Off · baseline only" },
                                    { value: "light", label: "Light · penetration 25 / 50" },
                                    { value: "full", label: "Full · penetration 10 / 25 / 50 / 75" },
                                ]}
                            />
                        </Field>
                        {entryExportFullRangeWarning(cfg) && (
                            <div className="col-span-2 border border-[hsl(var(--warning)/0.45)] bg-[hsl(var(--warning)/0.07)] clip-bevel-sm px-3 py-2 text-[10.5px] text-[hsl(var(--warning))]">
                                Full entry exports rerun the complete simulation for every threshold. Use Light or shorten the date range before a long backtest.
                            </div>
                        )}
                        <Field label="Entry Penetration Thresholds" className={`col-span-2 transition-opacity ${cfg.entryResearchExports ? "" : "opacity-45"}`} hint="Comma-separated percentages. Valid values are greater than 0 and less than 100.">
                            <NeonInput
                                value={cfg.entryPenetrationThresholds}
                                onChange={(e) => set("entryPenetrationThresholds")(e.target.value)}
                                disabled={!cfg.entryResearchExports}
                            />
                        </Field>
                        <div className="col-span-2 flex items-center justify-between border border-[hsl(var(--border-soft))] clip-bevel-sm p-3">
                            <div>
                                <div className="control-label text-[11px] font-mono uppercase tracking-wider text-muted-lab">Monte Carlo</div>
                                <div className="text-[10.5px] text-muted-lab">Robustness simulation (placeholder)</div>
                            </div>
                            <NeonToggle checked={cfg.monteCarlo} onChange={set("monteCarlo")} />
                        </div>
                    </div>
                </NeonPanel>

                <NeonPanel
                    className="lg:col-span-3"
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
                        <StatusMeta k="Plan passes" v={sanityRun.total_passes ?? generatedPlan.totalPasses ?? "—"} />
                        <StatusMeta k="Entry passes" v={sanityRun.scenario_plan_summary?.entry ?? generatedPlan.entry ?? "—"} />
                        <StatusMeta k="Protection passes" v={sanityRun.scenario_plan_summary?.protection ?? generatedPlan.protection ?? "—"} />
                        <StatusMeta k="Entry research exports" v={formatEntryResearchExports(sanityConfig)} />
                        <StatusMeta k="Entry thresholds" v={(sanityConfig.entry_penetration_thresholds || []).join(", ") || "—"} />
                        <StatusMeta k="Entry Depth" v={sanityConfig.ob_entry_depth_pct != null ? `${sanityConfig.ob_entry_depth_pct}%` : "—"} />
                        <StatusMeta k="Min OB Size" v={sanityConfig.min_ob_size_pips != null ? `${sanityConfig.min_ob_size_pips} pips` : "—"} />
                        <StatusMeta k="Max OB Size" v={sanityConfig.max_ob_size_pips != null ? `${sanityConfig.max_ob_size_pips} pips` : "—"} />
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
                    </div>
                </NeonPanel>

                <NeonPanel className="lg:col-span-3" title="Local Sidecar Run" action={<Pill tone={runError ? "warning" : runStatusTone(runJob)}>{runStatusLabel(runJob)}</Pill>}>
                    <div className="mb-3 flex items-start gap-2 border border-[hsl(var(--warning)/0.35)] bg-[hsl(var(--warning)/0.06)] clip-bevel-sm px-3 py-2">
                        <ShieldAlert className="w-3.5 h-3.5 shrink-0 mt-0.5 text-[hsl(var(--warning))]" />
                        <span className="text-[11px] font-mono uppercase tracking-wider text-[hsl(var(--warning))]">Requires local sidecar running at http://127.0.0.1:8787.</span>
                    </div>
                    {runError && (
                        <div className="mb-3 border border-[hsl(var(--danger)/0.4)] bg-[hsl(var(--danger)/0.06)] clip-bevel-sm px-3 py-2 text-[11px] font-mono text-[hsl(var(--danger))]">
                            {runError}
                        </div>
                    )}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                        {/* Run status — primary column */}
                        <div>
                            <div className="panel-title-label text-[10px] font-mono uppercase tracking-[0.2em] text-title-lab mb-2">Run status</div>
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
                                                <div className="control-label text-[10px] font-mono uppercase tracking-wider text-muted-lab">Structured run status</div>
                                                <div className="mt-1 text-[12px] font-mono text-white">
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
                                            <div className="text-[11px] font-mono text-[hsl(var(--success))]">
                                                Run completed. Import the completed output folder into Research Lab.
                                            </div>
                                            <div className="flex flex-wrap items-center gap-2">
                                                <NeonButton icon={FileInput} tone="success" onClick={onImportCompletedRun} disabled={importBusy}>
                                                    {importBusy ? "Importing..." : "Import Completed Run"}
                                                </NeonButton>
                                                {importedRunId && (
                                                    <>
                                                        <Pill tone="success">Run imported: {importedRunId}</Pill>
                                                        <Link to="/runs"><NeonButton tone="ghost">Open Runs</NeonButton></Link>
                                                        <Link to="/strategy-map"><NeonButton tone="ghost">Strategy Map</NeonButton></Link>
                                                        <Link to="/trade-inspector"><NeonButton tone="ghost">Trade Inspector</NeonButton></Link>
                                                    </>
                                                )}
                                            </div>
                                            {importError && (
                                                <div className="border border-[hsl(var(--danger)/0.4)] bg-[hsl(var(--danger)/0.06)] clip-bevel-sm px-2 py-1.5 text-[10.5px] font-mono text-[hsl(var(--danger))]">
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
                                <div className="panel-title-label text-[10px] font-mono uppercase tracking-[0.2em] text-title-lab">Generated Config</div>
                                <button
                                    onClick={() => setShowConfig((v) => !v)}
                                    className="flex items-center gap-1 control-label text-[10px] font-mono text-muted-lab hover:text-white transition-colors"
                                    aria-label="Toggle generated config"
                                >
                                    <span>{showConfig ? "Hide" : "Show"}</span>
                                    {showConfig ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                                </button>
                            </div>
                            {showConfig && (
                                <pre className="max-h-80 overflow-auto scrollbar-thin whitespace-pre-wrap border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2)/0.35)] clip-bevel-sm p-3 text-[10.5px] leading-relaxed font-mono text-[hsl(var(--accent-secondary))]">
                                    {JSON.stringify(sidecarConfig, null, 2)}
                                </pre>
                            )}
                        </div>
                    </div>
                </NeonPanel>
            </div>

            <div className="mx-6 mt-4 flex items-center gap-2 border border-[hsl(var(--warning)/0.4)] bg-[hsl(var(--warning)/0.06)] clip-bevel-sm px-3 py-2">
                <ShieldAlert className="w-3.5 h-3.5 text-[hsl(var(--warning))]" />
                <span className="text-[11px] font-mono uppercase tracking-wider text-[hsl(var(--warning))]">Research only · this builder does NOT place orders</span>
            </div>
        </div>
    );
}

function buildBacktesterConfig(cfg) {
    const allowedSessions = Boolean(cfg.sessionFilter) ? selectedAllowedSessions(cfg) : [];
    const entryMode = resolveEntryExportMode(cfg);
    const entryThresholds = entryMode === "off" ? [] : normalizeEntryThresholds(cfg.entryPenetrationThresholds);
    const entryResearchEnabled = entryMode !== "off" && entryThresholds.length > 0;
    const config = {
        symbol: cfg.symbol || "EURUSD",
        candle_file: normalizeCandleFile(cfg.dataFile),
        detection_timeframe: mapDetectionTf(cfg.detectionTf),
        execution_timeframe: mapExecutionTf(cfg.executionTf),
        start_date: cfg.dateFrom,
        end_date: cfg.dateTo,
        swing_length: Number(cfg.swing) || 50,
        ob_filter: mapObFilter(cfg.obFilter),
        min_ob_size_pips: Number(cfg.minObSizePips ?? 0),
        max_ob_size_pips: Number(cfg.maxObSizePips ?? 100),
        rr_multiple: Number(cfg.rr) || 3.3,
        ob_entry_depth_pct: Number(cfg.obEntryDepthPct || 0),
        entry_buffer_pips: Number(cfg.entryBuffer) || 0,
        stop_buffer_pips: Number(cfg.stopBuffer) || 0,
        spread_pips: Number(cfg.spread) || 0,
        slippage_pips: Number(cfg.slippage) || 0,
        commission_r_per_trade: Number(cfg.commission) || 0,
        verify_limit_ticks: Number(cfg.verifyTicks) || 0,
        execution_modes: [mapBuilderExecutionMode(cfg.executionMode)],
        trade_direction: mapBuilderTradeDirection(cfg.direction),
        entry_models: entryResearchEnabled ? ["baseline", "entry_penetration"] : ["baseline"],
        entry_penetration_thresholds: entryResearchEnabled ? entryThresholds : [],
        protection_modes: ["baseline"],
        session_filter_enabled: Boolean(cfg.sessionFilter),
        allowed_sessions: allowedSessions,
        news_blackout_enabled: Boolean(cfg.newsBlackout),
    };
    if (cfg.newsBlackout) {
        return {
            ...config,
            news_file: cfg.newsFile || "data/news/master_economic_calendar_2020_present.csv",
            news_blackout_minutes_before: Number(cfg.newsBlackoutBefore),
            news_blackout_minutes_after: Number(cfg.newsBlackoutAfter),
            news_blackout_impacts: Array.isArray(cfg.newsBlackoutImpacts) && cfg.newsBlackoutImpacts.length ? cfg.newsBlackoutImpacts : ["high"],
            news_blackout_currencies: Array.isArray(cfg.newsBlackoutCurrencies) ? cfg.newsBlackoutCurrencies : [],
            news_pause_pending_orders: Boolean(cfg.newsPausePending),
            news_block_new_fills: Boolean(cfg.newsBlockFills),
            news_cancel_if_touched_during_blackout: Boolean(cfg.newsCancelIfTouched),
            news_flatten_active_trades: Boolean(cfg.newsFlattenActiveTrades),
            news_flatten_minutes_before_blackout: Number(cfg.newsFlattenMinutesBefore ?? 5),
            ...(cfg.newsDebugObIds?.trim()
                ? { news_debug_ob_ids: cfg.newsDebugObIds.split(",").map((s) => s.trim()).filter(Boolean) }
                : {}),
        };
    }
    return config;
}

function normalizeEntryThresholds(value) {
    const raw = Array.isArray(value) ? value : String(value ?? "").split(",");
    return [...new Set(raw
        .map((item) => Number(String(item).trim()))
        .filter((item) => Number.isFinite(item) && item > 0 && item < 100)
        .map((item) => Number(item.toFixed(4))))]
        .sort((a, b) => a - b);
}

function resolveEntryExportMode(cfg) {
    if (cfg?.entryResearchExportMode === "off" || cfg?.entryResearchExports === false) return "off";
    if (cfg?.entryResearchExportMode === "full") return "full";
    if (cfg?.entryResearchExportMode === "light") return "light";
    const thresholds = normalizeEntryThresholds(cfg?.entryPenetrationThresholds);
    if (!thresholds.length) return "off";
    return thresholds.length > 2 || thresholds.includes(10) || thresholds.includes(75) ? "full" : "light";
}

function entryExportFullRangeWarning(cfg) {
    if (resolveEntryExportMode(cfg) !== "full") return false;
    const start = Date.parse(cfg?.dateFrom);
    const end = Date.parse(cfg?.dateTo);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return false;
    const months = (end - start) / (1000 * 60 * 60 * 24 * 30.44);
    return months >= 12;
}

function selectedAllowedSessions(cfg) {
    return [
        cfg.asia ? "Asia" : null,
        cfg.london ? "London" : null,
        cfg.lull ? "London Lull" : null,
        cfg.newYork ? "New York" : null,
        cfg.outside ? "Outside" : null,
    ].filter(Boolean);
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
    let baseline = 0;
    let protection = 0;
    for (const mode of protectionModes) {
        if (mode === "baseline") baseline += 1;
        else if (mode === "penetration_threshold_exit") protection += Math.max(1, penetrationThresholds.length);
        else if (mode === "close_confirmed_ob_breach_exit") protection += Math.max(1, closeBuffers.length);
        else protection += 1;
    }
    const entry = entryModels.includes("entry_penetration") ? entryThresholds.length : 0;
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

function mapBuilderExecutionMode(value) {
    const text = String(value || "").toLowerCase();
    if (text === "multi_position" || text.includes("multi")) return "allow_multi_position";
    if (text.includes("direction")) return "one_per_direction";
    return text || "single_position";
}

function mapBuilderTradeDirection(value) {
    const text = String(value || "").toLowerCase();
    if (text.includes("short")) return "short";
    if (text.includes("long")) return "long";
    return "both";
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
    return models.includes("entry_penetration")
        ? `baseline + penetration (${thresholds.length > 2 ? "full" : "light"})`
        : "baseline only";
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

const LOAD_FIELD_LABELS = {
    symbol: "symbol",
    detectionTf: "detection timeframe",
    executionTf: "execution timeframe",
    dateFrom: "date from",
    dateTo: "date to",
    dataFile: "data file",
    swing: "swing length",
    obFilter: "OB filter",
    minObSizePips: "Min OB size",
    maxObSizePips: "Max OB size",
    structure: "structure type",
    direction: "trade direction",
    rr: "RR multiple",
    obEntryDepthPct: "OB entry depth",
    entryBuffer: "entry buffer",
    stopBuffer: "stop buffer",
    verifyTicks: "verify limit ticks",
    executionMode: "execution mode",
    conflict: "position conflict",
    cancelAction: "cancelled by conflict",
    sessionFilter: "session filter",
    london: "London session",
    lull: "London Lull session",
    newYork: "New York session",
    asia: "Asia session",
    outside: "Outside session",
    originSession: "OB origin session",
    detectionSession: "OB detection session",
    newsBlackout: "news blackout",
    newsFile: "news file",
    newsBlackoutBefore: "news blackout before",
    newsBlackoutAfter: "news blackout after",
    newsBlackoutImpacts: "news blackout impacts",
    newsBlackoutCurrencies: "news blackout currencies",
    newsPausePending: "news pause pending",
    newsBlockFills: "news block fills",
    newsCancelIfTouched: "news cancel if touched",
    newsFlattenActiveTrades: "news flatten active trades",
    newsFlattenMinutesBefore: "news flatten minutes before",
    spread: "spread",
    slippage: "slippage",
    commission: "commission",
    entryResearchExportMode: "entry research export mode",
    entryResearchExports: "entry research exports",
    entryPenetrationThresholds: "entry penetration thresholds",
    monteCarlo: "Monte Carlo",
};

function buildRunConfigLoadReport(current, run) {
    const source = { ...(run?.summary || {}), ...(run?.config || {}) };
    const patch = {};
    const loaded = new Set();
    applyFirstPresent(patch, source, "symbol", ["symbol"]);
    applyFirstPresent(patch, source, "dataFile", ["candle_file", "dataFile", "data_file"], (value) => `data/candles/${normalizeCandleFile(value)}`);
    applyFirstPresent(patch, source, "detectionTf", ["detection_timeframe", "detection_tf", "detectionTf"], mapConfigDetectionTf);
    applyFirstPresent(patch, source, "executionTf", ["execution_timeframe", "execution_tf", "executionTf"], mapConfigExecutionTf);
    applyFirstPresent(patch, source, "dateFrom", ["start_date", "date_from", "dateFrom"], normalizeDateValue);
    applyFirstPresent(patch, source, "dateTo", ["end_date", "date_to", "dateTo"], normalizeDateValue);
    applyFirstPresent(patch, source, "swing", ["swing_length", "swing"], toNumber);
    applyFirstPresent(patch, source, "obFilter", ["ob_filter", "obFilter"], mapConfigObFilter);
    applyFirstPresent(patch, source, "minObSizePips", ["min_ob_size_pips", "minObSizePips"], toNumber);
    applyFirstPresent(patch, source, "maxObSizePips", ["max_ob_size_pips", "maxObSizePips"], toNumber);
    applyFirstPresent(patch, source, "structure", ["structure", "structure_type", "structure_filter", "allowed_structures"], mapConfigStructure);
    applyFirstPresent(patch, source, "direction", ["direction", "trade_direction", "direction_filter", "allowed_directions"], mapConfigDirection);
    applyFirstPresent(patch, source, "rr", ["rr_multiple", "rr", "risk_reward"], toNumber);
    applyFirstPresent(patch, source, "obEntryDepthPct", ["ob_entry_depth_pct", "obEntryDepthPct"], toNumber);
    applyFirstPresent(patch, source, "entryBuffer", ["entry_buffer_pips", "entry_buffer", "entryBuffer"], toNumber);
    applyFirstPresent(patch, source, "stopBuffer", ["stop_buffer_pips", "stop_buffer", "stopBuffer"], toNumber);
    applyFirstPresent(patch, source, "verifyTicks", ["verify_limit_ticks", "verify_ticks", "verifyTicks"], toNumber);
    applyFirstPresent(patch, source, "executionMode", ["execution_modes", "executionMode", "execution_mode"], mapConfigExecutionMode);
    applyFirstPresent(patch, source, "conflict", ["position_conflict", "conflict", "conflict_mode", "allow_auto_reversal"], mapConfigConflict);
    applyFirstPresent(patch, source, "cancelAction", ["cancel_action", "cancelled_by_conflict", "canceled_by_conflict", "conflict_cancel_action"], mapConfigCancelAction);
    applyFirstPresent(patch, source, "sessionFilter", ["session_filter", "session_filter_enabled", "use_session_filter"], toBool);
    applyFirstPresent(patch, source, "london", ["london", "session_london", "include_london"], toBool);
    applyFirstPresent(patch, source, "lull", ["lull", "london_lull", "session_lull", "include_london_lull"], toBool);
    applyFirstPresent(patch, source, "newYork", ["new_york", "newYork", "ny", "session_new_york", "include_new_york"], toBool);
    applyFirstPresent(patch, source, "asia", ["asia", "session_asia", "include_asia"], toBool);
    applyFirstPresent(patch, source, "outside", ["outside", "session_outside", "include_outside"], toBool);
    applyFirstPresent(patch, source, "originSession", ["origin_session", "ob_origin_session", "originSession"], mapConfigSession);
    applyFirstPresent(patch, source, "detectionSession", ["detection_session", "ob_detection_session", "detectionSession"], mapConfigSession);
    applyFirstPresent(patch, source, "newsBlackout", ["news_blackout_enabled", "newsBlackout"], toBool);
    applyFirstPresent(patch, source, "newsFile", ["news_file", "newsFile"]);
    applyFirstPresent(patch, source, "newsBlackoutBefore", ["news_blackout_minutes_before", "newsBlackoutBefore"], toNumber);
    applyFirstPresent(patch, source, "newsBlackoutAfter", ["news_blackout_minutes_after", "newsBlackoutAfter"], toNumber);
    applyFirstPresent(patch, source, "newsBlackoutImpacts", ["news_blackout_impacts", "newsBlackoutImpacts"], ensureArray);
    applyFirstPresent(patch, source, "newsBlackoutCurrencies", ["news_blackout_currencies", "newsBlackoutCurrencies"], ensureArray);
    applyFirstPresent(patch, source, "newsPausePending", ["news_pause_pending_orders", "newsPausePending"], toBool);
    applyFirstPresent(patch, source, "newsBlockFills", ["news_block_new_fills", "newsBlockFills"], toBool);
    applyFirstPresent(patch, source, "newsCancelIfTouched", ["news_cancel_if_touched_during_blackout", "newsCancelIfTouched"], toBool);
    applyFirstPresent(patch, source, "newsFlattenActiveTrades", ["news_flatten_active_trades", "newsFlattenActiveTrades"], toBool);
    applyFirstPresent(patch, source, "newsFlattenMinutesBefore", ["news_flatten_minutes_before_blackout", "newsFlattenMinutesBefore"], toNumber);
    applyFirstPresent(patch, source, "spread", ["spread", "spread_pips", "spreadPips"], toNumber);
    applyFirstPresent(patch, source, "slippage", ["slippage", "slippage_pips", "slippagePips"], toNumber);
    applyFirstPresent(patch, source, "commission", ["commission_r_per_trade", "commission", "commission_per_trade"], toNumber);
    applyFirstPresent(patch, source, "entryResearchExports", ["entry_models", "entryModels"], mapConfigEntryResearchExports);
    applyFirstPresent(patch, source, "entryPenetrationThresholds", ["entry_penetration_thresholds", "entryPenetrationThresholds"], mapConfigEntryThresholds);
    if ("entryResearchExports" in patch || "entryPenetrationThresholds" in patch) {
        patch.entryResearchExportMode = mapConfigEntryResearchExportMode(source.entry_models || source.entryModels, source);
    }
    applyFirstPresent(patch, source, "monteCarlo", ["monte_carlo", "monteCarlo", "monte_carlo_enabled"], toBool);

    Object.keys(patch).forEach((field) => loaded.add(field));
    const missingFields = Object.keys(LOAD_FIELD_LABELS)
        .filter((field) => !loaded.has(field))
        .map((field) => LOAD_FIELD_LABELS[field]);

    return {
        config: { ...current, ...removeEmptyPatchValues(patch) },
        loadedFields: [...loaded].map((field) => LOAD_FIELD_LABELS[field] || field),
        missingFields,
    };
}

function applyFirstPresent(patch, source, targetKey, sourceKeys, mapper = (value) => value) {
    for (const sourceKey of sourceKeys) {
        if (source?.[sourceKey] == null || source[sourceKey] === "") continue;
        const value = mapper(source[sourceKey]);
        if (value == null || value === "") continue;
        patch[targetKey] = value;
        return;
    }
}

function removeEmptyPatchValues(patch) {
    return Object.fromEntries(Object.entries(patch).filter(([, value]) => value != null && value !== ""));
}

function toNumber(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
}

function toBool(value) {
    if (typeof value === "boolean") return value;
    const text = String(value).trim().toLowerCase();
    if (["true", "1", "yes", "y"].includes(text)) return true;
    if (["false", "0", "no", "n"].includes(text)) return false;
    return Boolean(value);
}

function mapConfigEntryResearchExports(value) {
    const models = ensureArray(value).map((item) => String(item).trim().toLowerCase());
    return models.includes("entry_penetration");
}

function mapConfigEntryResearchExportMode(value, source) {
    const models = ensureArray(value).map((item) => String(item).trim().toLowerCase());
    const thresholds = normalizeEntryThresholds(source?.entry_penetration_thresholds || source?.entryPenetrationThresholds);
    if (!models.includes("entry_penetration")) return thresholds.length ? (thresholds.length > 2 || thresholds.includes(10) || thresholds.includes(75) ? "full" : "light") : "off";
    return thresholds.length > 2 || thresholds.includes(10) || thresholds.includes(75) ? "full" : "light";
}

function mapConfigEntryThresholds(value) {
    const thresholds = normalizeEntryThresholds(value);
    return thresholds.length ? thresholds.join(",") : null;
}

function ensureArray(value) {
    if (Array.isArray(value)) return value;
    if (typeof value === "string") return value.split(",").map((part) => part.trim()).filter(Boolean);
    return [];
}

function normalizeDateValue(value) {
    if (!value) return null;
    const text = String(value);
    return text.includes("T") ? text.slice(0, 10) : text.slice(0, 10);
}

function mapConfigDetectionTf(value) {
    const text = String(value || "").toLowerCase();
    return {
        "5min": "M5",
        "15min": "M15",
        "30min": "M30",
        "1h": "H1",
        "4h": "H4",
    }[text] || String(value || "M15").toUpperCase();
}

function mapConfigExecutionTf(value) {
    const text = String(value || "").toLowerCase();
    return {
        "1min": "1m",
        "5min": "5m",
    }[text] || String(value || "1m");
}

function mapConfigObFilter(value) {
    return String(value || "").toUpperCase() === "CMR" ? "CMR" : "ATR";
}

function mapConfigStructure(value) {
    const text = Array.isArray(value) ? value.join(",").toLowerCase() : String(value || "").toLowerCase();
    const hasBos = text.includes("bos");
    const hasChoch = text.includes("choch") || text.includes("change");
    if (hasBos && hasChoch) return "Both";
    if (hasChoch) return "CHoCH";
    if (hasBos) return "BOS";
    return "Both";
}

function mapConfigDirection(value) {
    const text = Array.isArray(value) ? value.join(",").toLowerCase() : String(value || "").toLowerCase();
    const hasLong = text.includes("long") || text.includes("bull") || text.includes("buy");
    const hasShort = text.includes("short") || text.includes("bear") || text.includes("sell");
    if (hasLong && hasShort) return "Both";
    if (hasShort) return "Short";
    if (hasLong) return "Long";
    return "Both";
}

function mapConfigExecutionMode(value) {
    const raw = Array.isArray(value) ? value[0] : value;
    const text = String(raw || "").toLowerCase();
    if (text.includes("multi")) return "multi_position";
    if (text.includes("direction")) return "one_per_direction";
    return text || "single_position";
}

function mapConfigConflict(value) {
    if (typeof value === "boolean") return value ? "Allow Auto Reversal" : "Block Opposite";
    const text = String(value || "").toLowerCase();
    if (text.includes("auto") || text.includes("reverse") || text.includes("flip")) return "Allow Auto Reversal";
    return "Block Opposite";
}

function mapConfigCancelAction(value) {
    const text = String(value || "").toLowerCase();
    if (text.includes("resume") || text.includes("pause")) return "Allow Resume";
    if (text.includes("touch")) return "Kill If Touched";
    return "Kill OB";
}

function mapConfigSession(value) {
    const text = String(value || "").toLowerCase().replace(/[_-]+/g, " ");
    if (!text || text === "any" || text === "all") return "Any";
    if (text.includes("lull")) return "London Lull";
    if (text.includes("new york") || text === "ny") return "New York";
    if (text.includes("london")) return "London";
    if (text.includes("asia")) return "Asia";
    return "Any";
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

function normalizeCandleFile(value) {
    const raw = String(value || "").trim();
    if (!raw) return "EURUSD_1m.csv";
    if (raw.startsWith("data/candles/")) return raw.slice("data/candles/".length) || "EURUSD_1m.csv";
    const parts = raw.split(/[\\/]/).filter(Boolean);
    const file = parts[parts.length - 1] || "";
    return file.toLowerCase().endsWith(".csv") ? file : "EURUSD_1m.csv";
}

function mapDetectionTf(value) {
    return {
        M5: "5min",
        M15: "15min",
        M30: "30min",
        H1: "1h",
        H4: "4h",
    }[value] || "15min";
}

function mapExecutionTf(value) {
    return {
        "1m": "1min",
        M1: "1min",
        "5m": "5min",
        M5: "5min",
    }[value] || "1min";
}

function mapObFilter(value) {
    return String(value || "").toUpperCase() === "CMR" ? "Cmr" : "Atr";
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

function StatusMeta({ k, v }) {
    return (
        <div className="border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2)/0.28)] clip-bevel-sm px-3 py-2">
            <div className="control-label text-[9.5px] font-mono uppercase tracking-wider text-muted-lab">{k}</div>
            <div className="mt-1 text-[11px] font-mono text-[hsl(var(--text-2))] break-all">{String(v ?? "—")}</div>
        </div>
    );
}

function LogBlock({ title, text, tone = "secondary" }) {
    if (!text) return null;
    const toneClass = tone === "warning" ? "text-[hsl(var(--warning))]" : "text-[hsl(var(--accent-secondary))]";
    return (
        <div>
            <div className="mb-1 control-label text-[9.5px] font-mono uppercase tracking-wider text-muted-lab">{title}</div>
            <pre className={`max-h-52 overflow-auto scrollbar-thin whitespace-pre-wrap border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel)/0.65)] clip-bevel-sm p-2 text-[10.5px] leading-relaxed font-mono ${toneClass}`}>{text}</pre>
        </div>
    );
}
