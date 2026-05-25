import React, { useMemo, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { PageHeader } from "@/components/lab/AppShell";
import { NeonPanel } from "@/components/lab/NeonPanel";
import { MetricChip } from "@/components/lab/MetricChip";
import { DataTable, ColoredR, Pill } from "@/components/lab/DataTable";
import { Field, NeonButton, NeonInput, NeonSelect } from "@/components/lab/controls";
import {
    ArrowRight,
    CheckSquare,
    Crosshair,
    Download,
    FileText,
    GitCompareArrows,
    Lightbulb,
    Map as MapIcon,
    PencilLine,
    Play,
    Radio,
    Rocket,
    Square,
    X,
} from "lucide-react";
import { getSidecarRun, getSidecarRunBundle, startSidecarRun } from "@/data/sidecarClient";
import { ingestRunBundle } from "@/data/importer";
import {
    addRunBundle,
    assignRunToProject,
    compactTimeframe,
    getRunDisplayName,
    getUniqueRunDisplayName,
    setActiveProjectId,
    setActiveRunId,
    setProjectActiveRun,
    updateRunBundle,
    updateResearchProject,
    useDataset,
} from "@/data/store";

const CHECKLIST = [
    ["baselineImported", "Baseline imported"],
    ["inspected", "Inspected"],
    ["entryTested", "Entry tested"],
    ["protectionTested", "Protection tested"],
    ["newsTested", "News tested"],
    ["candidateSelected", "Candidate selected"],
    ["validated", "Validated"],
    ["configExported", "Config exported"],
];

const ROLE_ORDER = ["baseline", "variant", "sweep_result", "candidate", "final", "imported"];
const SWEEP_TYPES = [
    "RR Sweep",
    "Entry Model Sweep",
    "Protection Sweep",
    "Session Filter Sweep",
    "OB Origin Session Sweep",
    "OB Detection Session Sweep",
    "News Blackout Sweep",
];
const DEFAULT_PROTECTION_CONFIGS = [
    { key: "baseline", label: "Baseline", mode: "baseline" },
    { key: "full_ob_breach_exit", label: "Full OB Breach", mode: "full_ob_breach_exit" },
    ...[50, 75, 90, 100].map((threshold) => ({
        key: `penetration_${String(threshold).replace(".", "p")}`,
        label: `Penetration ${threshold}%`,
        mode: "penetration_threshold_exit",
        threshold,
    })),
    ...[0, 0.5, 1, 2, 3].map((buffer) => ({
        key: `close_confirmed_${String(buffer).replace(".", "p")}`,
        label: `Close Confirmed ${buffer} pip`,
        mode: "close_confirmed_ob_breach_exit",
        buffer,
    })),
];

export default function ProjectDetail() {
    const { projectId } = useParams();
    const { PROJECTS, RUNS, activeProjectId, activeRunId, getRunData } = useDataset();
    const decodedId = decodeURIComponent(projectId || "");
    const project = PROJECTS.find((p) => p.id === decodedId);
    const [sweepOpen, setSweepOpen] = useState(false);
    const [sweepType, setSweepType] = useState("RR Sweep");
    const [sweepSourceRunId, setSweepSourceRunId] = useState("");
    const [sweepNote, setSweepNote] = useState("");
    const [findingTitle, setFindingTitle] = useState("");
    const [findingNote, setFindingNote] = useState("");
    const [findingType, setFindingType] = useState("finding");
    const [rrValuesText, setRrValuesText] = useState("2, 2.5, 3, 3.3, 3.5, 4");
    const [sweepRun, setSweepRun] = useState(null);

    const projectRuns = useMemo(() => {
        const ids = new Set(project?.runIds || []);
        return (RUNS || [])
            .filter((run) => run._source === "imported" && (ids.has(run.id) || run.projectId === project?.id))
            .sort((a, b) => ROLE_ORDER.indexOf(roleFor(a)) - ROLE_ORDER.indexOf(roleFor(b)));
    }, [RUNS, project]);

    if (!project) return <Navigate to="/projects" replace />;

    const isActive = project.id === activeProjectId;
    const checklist = project.checklist || {};
    const completed = CHECKLIST.filter(([key]) => checklist[key]).length;
    const nextStep = getNextStep(project, checklist);
    const baseline = runById(projectRuns, project.baselineRunId);
    const candidate = runById(projectRuns, project.candidateRunId);
    const final = runById(projectRuns, project.finalRunId);

    const setActive = () => setActiveProjectId(project.id);
    const openSweepPlan = (type = "RR Sweep") => {
        setSweepType(type);
        setSweepSourceRunId(project.baselineRunId || projectRuns[0]?.id || "");
        setSweepNote("");
        setRrValuesText("2, 2.5, 3, 3.3, 3.5, 4");
        setSweepOpen(true);
    };
    const toggleChecklist = (key) => {
        updateResearchProject(project.id, {
            checklist: {
                [key]: !checklist[key],
            },
        });
    };
    const addFinding = ({ type = findingType, title = findingTitle, note = findingNote, sourceRunId = "", extra = {} } = {}) => {
        const cleanTitle = String(title || "").trim();
        const cleanNote = String(note || "").trim();
        if (!cleanTitle && !cleanNote) return;
        const entry = {
            id: `finding_${Date.now()}`,
            type,
            title: cleanTitle || typeLabel(type),
            note: cleanNote,
            sourceRunId,
            createdAt: new Date().toISOString(),
            ...extra,
        };
        updateResearchProject(project.id, {
            findings: [entry, ...(project.findings || [])],
        });
        setFindingTitle("");
        setFindingNote("");
        setFindingType("finding");
    };
    const submitSweepPlan = () => {
        const normalized = normalizeSweepType(sweepType);
        const values = normalized === "rr" ? parseRrValues(rrValuesText) : [];
        addFinding({
            type: "sweep_plan",
            title: `${sweepType} planned`,
            note: sweepNote,
            sourceRunId: sweepSourceRunId,
            extra: {
                sweepType: normalized,
                values: normalized === "rr" ? values : undefined,
                configs: normalized === "protection" ? DEFAULT_PROTECTION_CONFIGS : undefined,
                status: "planned",
            },
        });
        setSweepOpen(false);
    };
    const updateFindingById = (findingId, patch) => {
        updateResearchProject(project.id, {
            findings: (project.findings || []).map((finding) => (
                finding.id === findingId ? { ...finding, ...patch } : finding
            )),
        });
    };
    const markCandidate = (run) => {
        if (!run?.id) return;
        updateResearchProject(project.id, {
            candidateRunId: run.id,
            checklist: { candidateSelected: true },
        });
        updateRunBundle(run.id, {
            runRole: "candidate",
            summary: { runRole: "candidate" },
        });
    };
    const runRrSweep = async (plan) => {
        if (sweepRun?.status === "running") return;
        const values = Array.isArray(plan.values) && plan.values.length ? plan.values : [2, 2.5, 3, 3.3, 3.5, 4];
        const sourceRunId = plan.sourceRunId || project.baselineRunId || projectRuns[0]?.id;
        const sourceRun = runById(projectRuns, sourceRunId);
        const sourceBundle = getRunData(sourceRunId);
        if (!sourceRun || !sourceBundle) {
            setSweepRun({ planId: plan.id, status: "failed", error: "Source run data is unavailable.", completed: 0, total: values.length });
            return;
        }
        setSweepRun({ planId: plan.id, status: "running", currentValue: values[0], completed: 0, total: values.length, error: "", results: [] });
        updateFindingById(plan.id, { status: "running", startedAt: new Date().toISOString() });

        const results = [];
        for (let index = 0; index < values.length; index += 1) {
            const rr = values[index];
            setSweepRun((prev) => ({ ...prev, currentValue: rr, completed: index }));
            try {
                const config = buildRrSweepConfig(sourceBundle, sourceRun, rr);
                const job = await startSidecarRun(config);
                const completed = await waitForSidecarJob(job.job_id);
                if (completed.status !== "succeeded") {
                    results.push({ rr, status: "failed", error: completed.stderr_tail || completed.error || "Sidecar run failed." });
                    continue;
                }
                const payload = await getSidecarRunBundle(job.job_id);
                const files = (payload.files || []).map((file) => new File([file.content || ""], file.name, { type: "text/plain" }));
                const imported = await ingestRunBundle(files);
                if (!imported.ok) {
                    const message = [
                        ...(imported.validationErrors || []).map((error) => error.message || String(error)),
                        ...(imported.errors || []).map((error) => error.error || String(error)),
                    ].filter(Boolean)[0] || "Sweep run imported with errors.";
                    results.push({ rr, status: "failed", error: message });
                    continue;
                }
                const displayName = getUniqueRunDisplayName(`${sourceRun.symbol || sourceBundle.summary?.symbol || "RUN"}_${compactTimeframe(sourceRun.detectionTf || sourceBundle.summary?.detectionTf)}_RR${Number(rr).toFixed(1)}`);
                imported.bundle.displayName = displayName;
                imported.bundle.name = displayName;
                imported.bundle.projectId = project.id;
                imported.bundle.parentRunId = sourceRunId;
                imported.bundle.sourceRunId = sourceRunId;
                imported.bundle.runRole = "sweep_result";
                imported.bundle.experimentType = "rr";
                imported.bundle.source = "sidecar";
                imported.bundle.sidecarJobId = job.job_id;
                imported.bundle.outputFolder = payload.folder || completed.output_folder || "";
                imported.bundle.summary = {
                    ...imported.bundle.summary,
                    displayName,
                    name: displayName,
                    projectId: project.id,
                    parentRunId: sourceRunId,
                    sourceRunId,
                    runRole: "sweep_result",
                    experimentType: "rr",
                    source: "sidecar",
                    sidecarJobId: job.job_id,
                    outputFolder: payload.folder || completed.output_folder || "",
                };
                addRunBundle(imported.bundle);
                assignRunToProject(imported.bundle.id, project.id, {
                    parentRunId: sourceRunId,
                    sourceRunId,
                    runRole: "sweep_result",
                    experimentType: "rr",
                });
                results.push({ rr, status: "completed", runId: imported.bundle.id });
            } catch (error) {
                results.push({ rr, status: "failed", error: formatError(error) });
            }
            setSweepRun((prev) => ({ ...prev, completed: index + 1, results: [...results] }));
        }
        const failed = results.filter((result) => result.status === "failed");
        const status = failed.length ? "failed" : "completed";
        setSweepRun((prev) => ({ ...prev, status, completed: values.length, currentValue: null, results, error: failed[0]?.error || "" }));
        updateFindingById(plan.id, {
            status,
            completedAt: new Date().toISOString(),
            results,
        });
    };
    const runProtectionSweep = async (plan) => {
        if (sweepRun?.status === "running") return;
        const configs = Array.isArray(plan.configs) && plan.configs.length ? plan.configs : DEFAULT_PROTECTION_CONFIGS;
        const sourceRunId = plan.sourceRunId || project.baselineRunId || projectRuns[0]?.id;
        const sourceRun = runById(projectRuns, sourceRunId);
        const sourceBundle = getRunData(sourceRunId);
        if (!sourceRun || !sourceBundle) {
            setSweepRun({ planId: plan.id, status: "failed", error: "Source run data is unavailable.", completed: 0, total: configs.length });
            return;
        }
        setSweepRun({ planId: plan.id, status: "running", currentValue: configs[0]?.label, completed: 0, total: configs.length, error: "", results: [] });
        updateFindingById(plan.id, { status: "running", startedAt: new Date().toISOString() });

        const results = [];
        for (let index = 0; index < configs.length; index += 1) {
            const protection = configs[index];
            setSweepRun((prev) => ({ ...prev, currentValue: protection.label || protection.mode, completed: index }));
            try {
                const config = buildProtectionSweepConfig(sourceBundle, sourceRun, protection);
                const job = await startSidecarRun(config);
                const completed = await waitForSidecarJob(job.job_id);
                if (completed.status !== "succeeded") {
                    results.push({ ...protection, status: "failed", error: completed.stderr_tail || completed.error || "Sidecar run failed." });
                    continue;
                }
                const payload = await getSidecarRunBundle(job.job_id);
                const files = (payload.files || []).map((file) => new File([file.content || ""], file.name, { type: "text/plain" }));
                const imported = await ingestRunBundle(files);
                if (!imported.ok) {
                    const message = [
                        ...(imported.validationErrors || []).map((error) => error.message || String(error)),
                        ...(imported.errors || []).map((error) => error.error || String(error)),
                    ].filter(Boolean)[0] || "Sweep run imported with errors.";
                    results.push({ ...protection, status: "failed", error: message });
                    continue;
                }
                const label = protectionLabel(protection);
                const displayName = getUniqueRunDisplayName(`${sourceRun.symbol || sourceBundle.summary?.symbol || "RUN"}_${compactTimeframe(sourceRun.detectionTf || sourceBundle.summary?.detectionTf)}_${label.replace(/\s+/g, "_")}`);
                imported.bundle.displayName = displayName;
                imported.bundle.name = displayName;
                imported.bundle.projectId = project.id;
                imported.bundle.parentRunId = sourceRunId;
                imported.bundle.sourceRunId = sourceRunId;
                imported.bundle.runRole = "sweep_result";
                imported.bundle.experimentType = "protection";
                imported.bundle.protectionMode = protection.mode;
                imported.bundle.protectionThreshold = protection.threshold ?? null;
                imported.bundle.protectionBuffer = protection.buffer ?? null;
                imported.bundle.source = "sidecar";
                imported.bundle.sidecarJobId = job.job_id;
                imported.bundle.outputFolder = payload.folder || completed.output_folder || "";
                imported.bundle.summary = {
                    ...imported.bundle.summary,
                    displayName,
                    name: displayName,
                    projectId: project.id,
                    parentRunId: sourceRunId,
                    sourceRunId,
                    runRole: "sweep_result",
                    experimentType: "protection",
                    protectionMode: protection.mode,
                    protectionThreshold: protection.threshold ?? null,
                    protectionBuffer: protection.buffer ?? null,
                    source: "sidecar",
                    sidecarJobId: job.job_id,
                    outputFolder: payload.folder || completed.output_folder || "",
                };
                addRunBundle(imported.bundle);
                assignRunToProject(imported.bundle.id, project.id, {
                    parentRunId: sourceRunId,
                    sourceRunId,
                    runRole: "sweep_result",
                    experimentType: "protection",
                    protectionMode: protection.mode,
                    protectionThreshold: protection.threshold ?? null,
                    protectionBuffer: protection.buffer ?? null,
                });
                results.push({ ...protection, status: "completed", runId: imported.bundle.id });
            } catch (error) {
                results.push({ ...protection, status: "failed", error: formatError(error) });
            }
            setSweepRun((prev) => ({ ...prev, completed: index + 1, results: [...results] }));
        }
        const failed = results.filter((result) => result.status === "failed");
        const status = failed.length ? "failed" : "completed";
        setSweepRun((prev) => ({ ...prev, status, completed: configs.length, currentValue: null, results, error: failed[0]?.error || "" }));
        updateResearchProject(project.id, {
            checklist: { protectionTested: true },
            findings: (project.findings || []).map((finding) => (
                finding.id === plan.id
                    ? { ...finding, status, completedAt: new Date().toISOString(), results }
                    : finding
            )),
        });
    };

    return (
        <div className="pb-12">
            <PageHeader
                eyebrow="RESEARCH PROJECT"
                title={project.name}
                subtitle={`${project.symbol || "—"} · ${project.timeframe || "—"} · ${project.status || "active"}`}
                actions={
                    <>
                        <NeonButton icon={Radio} tone={isActive ? "success" : "secondary"} onClick={setActive}>
                            {isActive ? "Active Project" : "Set Active"}
                        </NeonButton>
                        <Link to="/strategy" onClick={setActive}><NeonButton icon={Play} tone="primary">Open Builder</NeonButton></Link>
                        <Link to="/runs"><NeonButton tone="ghost">Open Runs</NeonButton></Link>
                        <NeonButton icon={GitCompareArrows} tone="ghost" disabled>Compare Project Runs Later</NeonButton>
                    </>
                }
            />

            <div className="px-6 mb-4 flex flex-wrap items-center gap-2">
                <Link to="/strategy" onClick={setActive}>
                    <NeonButton icon={Rocket} tone="primary">Create Variant</NeonButton>
                </Link>
                <NeonButton icon={PencilLine} tone="secondary" onClick={() => openSweepPlan("RR Sweep")}>Plan Sweep</NeonButton>
                <Link to="/comparison">
                    <NeonButton icon={GitCompareArrows} tone="ghost">Compare Project Runs</NeonButton>
                </Link>
                <NeonButton icon={Lightbulb} tone="ghost" disabled>Mark Candidate Later</NeonButton>
                <NeonButton icon={Download} tone="ghost" disabled={!project.finalRunId}>Export Final Config</NeonButton>
            </div>

            <div className="px-6 grid grid-cols-2 md:grid-cols-4 gap-3">
                <MetricChip label="Project Runs" value={String(projectRuns.length)} sub="linked runs" tone="primary" />
                <MetricChip label="Checklist" value={`${completed}/${CHECKLIST.length}`} sub="workflow progress" tone="secondary" />
                <MetricChip label="Baseline" value={baseline ? "Ready" : "Missing"} sub={baseline ? getRunDisplayName(baseline) : "create/import first"} tone={baseline ? "success" : "warning"} />
                <MetricChip label="Candidate" value={candidate ? "Selected" : "Open"} sub={candidate ? getRunDisplayName(candidate) : "not selected"} tone={candidate ? "success" : "muted"} />
            </div>

            <div className="px-6 mt-5 grid grid-cols-1 xl:grid-cols-3 gap-4">
                <NeonPanel title="Next Step" action={<Pill tone="primary">Workflow</Pill>}>
                    <div className="border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2)/0.35)] clip-bevel-sm p-4">
                        <div className="text-[9.5px] font-mono uppercase tracking-[0.22em] text-muted-lab">Recommended</div>
                        <div className="mt-1 font-display text-[18px] text-white">{nextStep.title}</div>
                        <p className="mt-1 text-[12px] leading-relaxed text-[hsl(var(--text-2))]">{nextStep.copy}</p>
                        <div className="mt-3">
                            {nextStep.sweepType ? (
                                <NeonButton icon={ArrowRight} tone="secondary" onClick={() => openSweepPlan(nextStep.sweepType)}>{nextStep.action}</NeonButton>
                            ) : (
                                <Link to={nextStep.to} onClick={nextStep.activateProject ? setActive : undefined}>
                                    <NeonButton icon={ArrowRight} tone="secondary">{nextStep.action}</NeonButton>
                                </Link>
                            )}
                        </div>
                    </div>
                </NeonPanel>

                <NeonPanel className="xl:col-span-2" title="Baseline / Candidate / Final Slots">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <RunSlot title="Baseline Run" run={baseline} empty="Create/import a baseline run from Strategy Builder." />
                        <RunSlot title="Candidate Run" run={candidate} empty="Choose a candidate after experiments." />
                        <RunSlot title="Final Run" run={final} empty="Mark final after validation." />
                    </div>
                </NeonPanel>

                <NeonPanel title="Project Checklist">
                    <div className="space-y-2">
                        {CHECKLIST.map(([key, label]) => {
                            const checked = Boolean(checklist[key]);
                            const Icon = checked ? CheckSquare : Square;
                            return (
                                <button
                                    key={key}
                                    type="button"
                                    onClick={() => toggleChecklist(key)}
                                    className={`w-full flex items-center justify-between gap-3 px-3 py-2 border clip-bevel-sm text-left transition-colors ${
                                        checked
                                            ? "border-[hsl(var(--success)/0.45)] bg-[hsl(var(--success)/0.06)]"
                                            : "border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2)/0.28)] hover:border-[hsl(var(--accent-secondary)/0.45)]"
                                    }`}
                                >
                                    <span className="text-[11.5px] text-[hsl(var(--text-2))]">{label}</span>
                                    <Icon className={`w-4 h-4 ${checked ? "text-[hsl(var(--success))]" : "text-muted-lab"}`} />
                                </button>
                            );
                        })}
                    </div>
                </NeonPanel>

                <NeonPanel className="xl:col-span-2" title="Project Runs" action={<Pill tone="secondary">{projectRuns.length} RUNS</Pill>}>
                    <DataTable
                        testId="project-runs-table"
                        rowKey="id"
                        columns={[
                            { key: "displayName", label: "Run", render: (run) => <span className="text-[hsl(var(--accent-primary))]">{getRunDisplayName(run)}</span> },
                            { key: "runRole", label: "Role", render: (run) => <Pill tone={roleTone(roleFor(run))}>{roleLabel(roleFor(run))}</Pill> },
                            { key: "experimentType", label: "Experiment", render: (run) => run.experimentType || "manual" },
                            { key: "netR", label: "Net R", align: "right", render: (run) => <ColoredR value={run.netR || 0} /> },
                            { key: "winRate", label: "WR", align: "right", render: (run) => `${Number(run.winRate || 0).toFixed(1)}%` },
                            { key: "trades", label: "Trades", align: "right" },
                            { key: "actions", label: "Actions", align: "right", render: (run) => <RunActions run={run} projectId={decodedId} projectActiveRunId={project.activeRunId} globalActiveRunId={activeRunId} /> },
                        ]}
                        rows={projectRuns}
                    />
                    {!projectRuns.length && (
                        <div className="py-10 text-center">
                            <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-lab">No Linked Runs</div>
                            <div className="mt-2 text-[12px] text-[hsl(var(--text-2))]">Create/import a baseline run from Strategy Builder.</div>
                        </div>
                    )}
                </NeonPanel>

                <NeonPanel className="xl:col-span-3" title="Experiment Timeline" action={<Pill tone="secondary">{timelineItems(project, projectRuns).length} ITEMS</Pill>}>
                    <div className="space-y-2">
                        {timelineItems(project, projectRuns).map((item) => (
                            <TimelineItem
                                key={item.id}
                                item={item}
                                projectRuns={projectRuns}
                                getRunData={getRunData}
                                sweepRun={sweepRun}
                                onRunRrSweep={runRrSweep}
                                onRunProtectionSweep={runProtectionSweep}
                                onMarkCandidate={markCandidate}
                                projectId={decodedId}
                                projectActiveRunId={project.activeRunId}
                                globalActiveRunId={activeRunId}
                            />
                        ))}
                        {!timelineItems(project, projectRuns).length && (
                            <div className="py-10 text-center border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2)/0.24)] clip-bevel-sm">
                                <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-lab">No Timeline Items</div>
                                <div className="mt-2 text-[12px] text-[hsl(var(--text-2))]">Create a baseline run or add a sweep plan to start the project timeline.</div>
                            </div>
                        )}
                    </div>
                </NeonPanel>

                <NeonPanel className="xl:col-span-3" title="Research Findings" action={<Pill tone="primary">{(project.findings || []).length} NOTES</Pill>}>
                    <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
                        <div className="border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2)/0.28)] clip-bevel-sm p-3">
                            <div className="text-[9.5px] font-mono uppercase tracking-[0.22em] text-title-lab mb-3">Add Finding</div>
                            <div className="space-y-3">
                                <Field label="Type">
                                    <NeonSelect
                                        value={findingType}
                                        onChange={setFindingType}
                                        options={[
                                            { value: "finding", label: "Finding" },
                                            { value: "question", label: "Question" },
                                            { value: "sweep_plan", label: "Sweep Plan" },
                                        ]}
                                    />
                                </Field>
                                <Field label="Title">
                                    <NeonInput value={findingTitle} onChange={(event) => setFindingTitle(event.target.value)} placeholder="e.g. London fills outperform NY" />
                                </Field>
                                <Field label="Note">
                                    <textarea
                                        value={findingNote}
                                        onChange={(event) => setFindingNote(event.target.value)}
                                        placeholder="Capture the research thought, question, or next test..."
                                        className="w-full min-h-[92px] resize-y rounded-none clip-bevel-sm border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel))] px-3 py-2 text-[12px] text-white outline-none focus:border-[hsl(var(--accent-secondary))]"
                                    />
                                </Field>
                                <NeonButton icon={FileText} tone="secondary" onClick={() => addFinding()}>Save Finding</NeonButton>
                            </div>
                        </div>
                        <div className="xl:col-span-2 space-y-2 max-h-[360px] overflow-auto scrollbar-thin pr-1">
                            {(project.findings || []).length ? (project.findings || []).map((finding) => (
                                <FindingItem key={finding.id || `${finding.createdAt}-${finding.title}`} finding={finding} runs={projectRuns} />
                            )) : (
                                <div className="py-10 text-center border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2)/0.24)] clip-bevel-sm">
                                    <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-lab">No Findings Yet</div>
                                    <div className="mt-2 text-[12px] text-[hsl(var(--text-2))]">Capture sweep plans, open questions, and research decisions here.</div>
                                </div>
                            )}
                        </div>
                    </div>
                </NeonPanel>
            </div>

            {sweepOpen && (
                <div className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm flex items-center justify-center p-6">
                    <div className="w-full max-w-2xl clip-bevel p-[1px] bg-gradient-to-br from-[hsl(var(--accent-secondary)/0.65)] to-[hsl(var(--border-mid))]">
                        <div className="clip-bevel bg-[hsl(var(--panel))] p-4">
                            <div className="flex items-start justify-between gap-4">
                                <div>
                                    <div className="text-[9.5px] font-mono uppercase tracking-[0.22em] text-muted-lab">Planned Experiment</div>
                                    <div className="mt-1 font-display text-[20px] text-white">Plan Sweep</div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setSweepOpen(false)}
                                    className="grid place-items-center w-8 h-8 clip-bevel-sm border border-[hsl(var(--border-mid))] text-[hsl(var(--text-2))] hover:text-white hover:border-[hsl(var(--accent-secondary))]"
                                    aria-label="Close sweep planner"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                                <Field label="Source Run">
                                    <NeonSelect
                                        value={sweepSourceRunId}
                                        onChange={setSweepSourceRunId}
                                        options={[
                                            { value: "", label: "— no source run —" },
                                            ...projectRuns.map((run) => ({ value: run.id, label: getRunDisplayName(run) })),
                                        ]}
                                    />
                                </Field>
                                <Field label="Sweep Type">
                                    <NeonSelect value={sweepType} onChange={setSweepType} options={SWEEP_TYPES} />
                                </Field>
                                {normalizeSweepType(sweepType) === "rr" ? (
                                    <Field label="RR Values" className="md:col-span-2">
                                        <NeonInput
                                            value={rrValuesText}
                                            onChange={(event) => setRrValuesText(event.target.value)}
                                            placeholder="2, 2.5, 3, 3.3, 3.5, 4"
                                        />
                                    </Field>
                                ) : normalizeSweepType(sweepType) === "protection" ? (
                                    <div className="md:col-span-2 border border-[hsl(var(--accent-secondary)/0.35)] bg-[hsl(var(--accent-secondary)/0.06)] clip-bevel-sm px-3 py-2 text-[11px] text-[hsl(var(--text-2))]">
                                        Runs baseline, full OB breach, penetration thresholds 50/75/90/100, and close-confirmed buffers 0/0.5/1/2/3 pips.
                                    </div>
                                ) : (
                                    <div className="md:col-span-2 border border-[hsl(var(--warning)/0.35)] bg-[hsl(var(--warning)/0.06)] clip-bevel-sm px-3 py-2 text-[11px] text-[hsl(var(--warning))]">
                                        Execution coming later. This sweep type is saved as a plan only.
                                    </div>
                                )}
                                <Field label="What are you testing?" className="md:col-span-2">
                                    <textarea
                                        value={sweepNote}
                                        onChange={(event) => setSweepNote(event.target.value)}
                                        placeholder="What are you testing?"
                                        className="w-full min-h-[120px] resize-y rounded-none clip-bevel-sm border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2)/0.45)] px-3 py-2 text-[12px] text-white outline-none focus:border-[hsl(var(--accent-secondary))]"
                                    />
                                </Field>
                            </div>
                            <div className="mt-4 flex items-center justify-end gap-2">
                                <NeonButton tone="ghost" onClick={() => setSweepOpen(false)}>Cancel</NeonButton>
                                <NeonButton icon={PencilLine} tone="primary" onClick={submitSweepPlan}>Save Sweep Plan</NeonButton>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function RunSlot({ title, run, empty }) {
    return (
        <div className="border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2)/0.35)] clip-bevel-sm px-3 py-3">
            <div className="text-[9.5px] font-mono uppercase tracking-[0.22em] text-muted-lab">{title}</div>
            {run ? (
                <>
                    <div className="mt-1 text-[13px] text-white">{getRunDisplayName(run)}</div>
                    <div className="mt-1 font-mono text-[11px]"><ColoredR value={run.netR || 0} /> · {Number(run.winRate || 0).toFixed(1)}% WR</div>
                </>
            ) : (
                <div className="mt-2 text-[11.5px] leading-relaxed text-[hsl(var(--text-2))]">{empty}</div>
            )}
        </div>
    );
}

function RunActions({ run, projectId, projectActiveRunId, globalActiveRunId }) {
    const activateRun = () => setActiveRunId(run.id);
    const isGlobalActive = run.id === globalActiveRunId;
    const isProjectActive = run.id === projectActiveRunId;
    const setAsProjectActive = () => {
        if (projectId) setProjectActiveRun(projectId, run.id);
        else setActiveRunId(run.id);
    };
    return (
        <div className="flex items-center justify-end gap-1.5 flex-wrap">
            {isGlobalActive ? (
                <span className="px-2 py-1 text-[10px] font-mono uppercase tracking-wider border border-[hsl(var(--success)/0.5)] text-[hsl(var(--success))] bg-[hsl(var(--success)/0.06)] clip-bevel-sm">
                    Active Run
                </span>
            ) : (
                <button
                    type="button"
                    onClick={setAsProjectActive}
                    className="px-2 py-1 text-[10px] font-mono uppercase tracking-wider border border-[hsl(var(--border-mid))] text-[hsl(var(--text-2))] hover:text-[hsl(var(--accent-primary))] hover:border-[hsl(var(--accent-primary)/0.5)] clip-bevel-sm"
                    title={isProjectActive ? "Currently the project's active run" : "Set as the active run for this project"}
                >
                    {isProjectActive ? "Project Active" : "Set Active Run"}
                </button>
            )}
            <Link to={`/runs/${encodeURIComponent(run.id)}`}>
                <button type="button" className="px-2 py-1 text-[10px] font-mono uppercase tracking-wider border border-[hsl(var(--border-mid))] text-[hsl(var(--text-2))] hover:text-white hover:border-[hsl(var(--accent-secondary))] clip-bevel-sm">
                    Detail
                </button>
            </Link>
            <Link to="/strategy-map" onClick={activateRun}>
                <button type="button" className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-mono uppercase tracking-wider border border-[hsl(var(--border-mid))] text-[hsl(var(--text-2))] hover:text-white hover:border-[hsl(var(--accent-secondary))] clip-bevel-sm">
                    <MapIcon className="w-3 h-3" /> Map
                </button>
            </Link>
            <Link to="/trade-inspector" onClick={activateRun}>
                <button type="button" className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-mono uppercase tracking-wider border border-[hsl(var(--border-mid))] text-[hsl(var(--text-2))] hover:text-white hover:border-[hsl(var(--accent-secondary))] clip-bevel-sm">
                    <Crosshair className="w-3 h-3" /> Inspect
                </button>
            </Link>
        </div>
    );
}

function FindingItem({ finding, runs }) {
    const sourceRun = runById(runs, finding.sourceRunId);
    return (
        <div className="border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2)/0.28)] clip-bevel-sm px-3 py-3">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <div className="flex items-center gap-2">
                        <Pill tone={finding.type === "sweep_plan" ? "secondary" : finding.type === "question" ? "warning" : "primary"}>
                            {typeLabel(finding.type)}
                        </Pill>
                        <span className="font-display text-[13px] text-white">{finding.title || typeLabel(finding.type)}</span>
                    </div>
                    {finding.note && (
                        <p className="mt-2 text-[12px] leading-relaxed text-[hsl(var(--text-2))] whitespace-pre-wrap">{finding.note}</p>
                    )}
                    {sourceRun && (
                        <div className="mt-2 text-[10.5px] font-mono text-muted-lab">
                            Source: {getRunDisplayName(sourceRun)}
                        </div>
                    )}
                </div>
                <span className="shrink-0 text-[10px] font-mono text-muted-lab">{formatDateTime(finding.createdAt)}</span>
            </div>
        </div>
    );
}

function TimelineItem({ item, projectRuns, getRunData, sweepRun, onRunRrSweep, onRunProtectionSweep, onMarkCandidate, projectId, projectActiveRunId, globalActiveRunId }) {
    const parent = item.sourceRunId ? runById(projectRuns, item.sourceRunId) : null;
    const isRunning = sweepRun?.planId === item.id && sweepRun.status === "running";
    const canRunRr = item.kind === "sweep_plan" && normalizeSweepType(item.sweepType || item.title) === "rr";
    const canRunProtection = item.kind === "sweep_plan" && normalizeSweepType(item.sweepType || item.title) === "protection";
    const rrSummary = canRunRr ? buildRrSweepSummary(item.raw, projectRuns, getRunData) : null;
    const protectionSummary = canRunProtection ? buildProtectionSweepSummary(item.raw, projectRuns, getRunData) : null;
    return (
        <div className={`relative border clip-bevel-sm px-3 py-3 bg-[hsl(var(--panel-2)/0.28)] ${
            item.indent ? "ml-6 border-[hsl(var(--border-soft))]" : "border-[hsl(var(--border-mid))]"
        }`}>
            {item.indent && <span className="absolute -left-4 top-5 w-4 h-px bg-[hsl(var(--border-mid))]" />}
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                        <Pill tone={itemTone(item)}>{itemLabel(item)}</Pill>
                        <span className="font-display text-[13px] text-white truncate">{item.title}</span>
                        {item.status && <Pill tone={item.status === "completed" ? "success" : item.status === "failed" ? "danger" : item.status === "running" ? "warning" : "muted"}>{item.status}</Pill>}
                    </div>
                    {parent && <div className="mt-1 text-[10.5px] font-mono text-muted-lab">Child of {getRunDisplayName(parent)}</div>}
                    {item.note && <div className="mt-1 text-[11.5px] text-[hsl(var(--text-2))] whitespace-pre-wrap">{item.note}</div>}
                    {item.kind === "run" && (
                        <div className="mt-2 flex flex-wrap items-center gap-3 font-mono text-[11px]">
                            <span><ColoredR value={item.run.netR || 0} /></span>
                            <span className="text-[hsl(var(--text-2))]">{Number(item.run.winRate || 0).toFixed(1)}% WR</span>
                            <span className="text-muted-lab">{item.run.trades || 0} trades</span>
                        </div>
                    )}
                    {isRunning && (
                        <div className="mt-2 text-[10.5px] font-mono text-[hsl(var(--warning))]">
                            Running {sweepRun.currentValue ?? "—"} · {sweepRun.completed}/{sweepRun.total} completed
                        </div>
                    )}
                    {sweepRun?.planId === item.id && sweepRun.status === "failed" && sweepRun.error && (
                        <div className="mt-2 text-[10.5px] font-mono text-[hsl(var(--danger))]">{sweepRun.error}</div>
                    )}
                    {rrSummary?.rows?.length > 0 && (
                        <SweepSummaryTable
                            mode="rr"
                            rows={rrSummary.rows}
                            bestNetRId={rrSummary.bestNetRId}
                            bestExpectancyId={rrSummary.bestExpectancyId}
                            lowestDdId={rrSummary.lowestDdId}
                            onMarkCandidate={onMarkCandidate}
                        />
                    )}
                    {protectionSummary?.rows?.length > 0 && (
                        <SweepSummaryTable
                            mode="protection"
                            rows={protectionSummary.rows}
                            bestNetRId={protectionSummary.bestNetRId}
                            bestExpectancyId={protectionSummary.bestExpectancyId}
                            lowestDdId={protectionSummary.lowestDdId}
                            onMarkCandidate={onMarkCandidate}
                        />
                    )}
                </div>
                <div className="shrink-0 flex items-center gap-1.5">
                    {item.kind === "run" && <RunActions run={item.run} projectId={projectId} projectActiveRunId={projectActiveRunId} globalActiveRunId={globalActiveRunId} />}
                    {(canRunRr || canRunProtection) && (
                        <button
                            type="button"
                            onClick={() => canRunRr ? onRunRrSweep(item.raw) : onRunProtectionSweep(item.raw)}
                            disabled={sweepRun?.status === "running" || item.status === "running"}
                            className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-mono uppercase tracking-wider border border-[hsl(var(--accent-primary)/0.5)] text-[hsl(var(--accent-primary))] bg-[hsl(var(--accent-primary)/0.06)] hover:bg-[hsl(var(--accent-primary)/0.12)] disabled:opacity-40 disabled:cursor-not-allowed clip-bevel-sm"
                        >
                            <Play className="w-3 h-3" />
                            Run Sweep
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}

function SweepSummaryTable({ mode, rows, bestNetRId, bestExpectancyId, lowestDdId, onMarkCandidate }) {
    return (
        <div className="mt-3 overflow-x-auto scrollbar-thin border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel)/0.45)] clip-bevel-sm">
            <table className="w-full min-w-[860px] font-mono text-[11px]">
                <thead>
                    <tr className="text-[9.5px] uppercase tracking-[0.18em] text-muted-lab border-b border-[hsl(var(--border-soft))]">
                        <th className="text-left px-2 py-2">{mode === "protection" ? "Protection Mode" : "RR"}</th>
                        {mode === "protection" && <th className="text-left px-2 py-2">Threshold/Buffer</th>}
                        <th className="text-right px-2 py-2">Net R</th>
                        <th className="text-right px-2 py-2">WR</th>
                        <th className="text-right px-2 py-2">Trades</th>
                        <th className="text-right px-2 py-2">Max DD</th>
                        <th className="text-right px-2 py-2">Expectancy</th>
                        <th className="text-right px-2 py-2">Validation</th>
                        <th className="text-right px-2 py-2">Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row) => {
                        const tags = [
                            row.run.id === bestNetRId ? "Best Net R" : null,
                            row.run.id === bestExpectancyId ? "Best Exp" : null,
                            row.run.id === lowestDdId ? "Lowest DD" : null,
                        ].filter(Boolean);
                        return (
                            <tr key={row.run.id} className="border-b border-[hsl(var(--border-soft)/0.45)] last:border-b-0">
                                <td className="px-2 py-2">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className="text-white">{mode === "protection" ? protectionModeLabel(row.protectionMode) : formatNumber(row.rr, 1)}</span>
                                        {tags.map((tag) => <Pill key={tag} tone="success">{tag}</Pill>)}
                                    </div>
                                </td>
                                {mode === "protection" && <td className="px-2 py-2 text-[hsl(var(--text-2))]">{protectionThresholdLabel(row)}</td>}
                                <td className="text-right px-2 py-2"><ColoredR value={row.netR} /></td>
                                <td className="text-right px-2 py-2 text-[hsl(var(--text-2))]">{formatNumber(row.winRate, 1)}%</td>
                                <td className="text-right px-2 py-2 text-[hsl(var(--text-2))]">{row.trades}</td>
                                <td className="text-right px-2 py-2 text-[hsl(var(--text-2))]">{row.maxDd == null ? "—" : `${formatNumber(row.maxDd, 1)}R`}</td>
                                <td className="text-right px-2 py-2 text-[hsl(var(--text-2))]">{row.expectancy == null ? "—" : `${formatNumber(row.expectancy, 3)}R`}</td>
                                <td className="text-right px-2 py-2 text-[hsl(var(--success))]">{row.validation == null ? "—" : `${formatNumber(row.validation, 1)}%`}</td>
                                <td className="px-2 py-2">
                                    <div className="flex items-center justify-end gap-1.5">
                                        <button
                                            type="button"
                                            onClick={() => onMarkCandidate(row.run)}
                                            className="px-2 py-1 text-[10px] font-mono uppercase tracking-wider border border-[hsl(var(--warning)/0.5)] text-[hsl(var(--warning))] bg-[hsl(var(--warning)/0.06)] hover:bg-[hsl(var(--warning)/0.12)] clip-bevel-sm"
                                        >
                                            Mark Candidate
                                        </button>
                                        <Link to={`/runs/${encodeURIComponent(row.run.id)}`}>
                                            <button type="button" className="px-2 py-1 text-[10px] font-mono uppercase tracking-wider border border-[hsl(var(--border-mid))] text-[hsl(var(--text-2))] hover:text-white hover:border-[hsl(var(--accent-secondary))] clip-bevel-sm">
                                                Detail
                                            </button>
                                        </Link>
                                        <Link to="/comparison">
                                            <button type="button" className="px-2 py-1 text-[10px] font-mono uppercase tracking-wider border border-[hsl(var(--border-mid))] text-[hsl(var(--text-2))] hover:text-white hover:border-[hsl(var(--accent-secondary))] clip-bevel-sm">
                                                Compare
                                            </button>
                                        </Link>
                                    </div>
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}

function getNextStep(project, checklist) {
    if (!project.baselineRunId) {
        return {
            title: "Create baseline run",
            copy: "Start by running or importing the first clean baseline for this project.",
            action: "Create Baseline Run",
            to: "/strategy",
            activateProject: true,
        };
    }
    if (!checklist.inspected) {
        return { title: "Inspect baseline", copy: "Review the baseline in Run Detail, Strategy Map, and Trade Inspector.", action: "Open Baseline Run", to: `/runs/${encodeURIComponent(project.baselineRunId)}` };
    }
    if (!checklist.entryTested) {
        return { title: "Test entry models", copy: "Plan an entry model sweep before promoting a candidate.", action: "Plan Entry Sweep", sweepType: "Entry Model Sweep" };
    }
    if (!checklist.protectionTested) {
        return { title: "Test protections", copy: "Plan a protection sweep to test failure behavior controls.", action: "Plan Protection Sweep", sweepType: "Protection Sweep" };
    }
    if (!project.candidateRunId) {
        return { title: "Choose candidate", copy: "Select the run that should move forward to validation.", action: "Choose Candidate Later", to: `/projects/${encodeURIComponent(project.id)}` };
    }
    if (!checklist.validated) {
        return { title: "Validate candidate", copy: "Use comparison and walk-forward checks before marking the project validated.", action: "Validate Candidate Later", to: "/comparison" };
    }
    return { title: "Export final config", copy: "The project is validated. Preserve the final config for downstream handoff.", action: "Open Builder", to: "/strategy", activateProject: true };
}

function timelineItems(project, runs) {
    const planSourceIds = new Set((project.findings || [])
        .filter((finding) => finding.type === "sweep_plan" && ["rr", "protection"].includes(normalizeSweepType(finding.sweepType || finding.title)))
        .map((finding) => finding.sourceRunId)
        .filter(Boolean));
    const runItems = (runs || []).map((run) => ({
        id: `run_${run.id}`,
        kind: "run",
        title: getRunDisplayName(run),
        role: roleFor(run),
        sourceRunId: run.parentRunId || run.sourceRunId,
        indent: Boolean(run.parentRunId || run.sourceRunId || (["rr", "protection"].includes(run.experimentType) && planSourceIds.has(run.sourceRunId || run.parentRunId))),
        createdAt: run.importedAt || run.summary?.importedAt || "",
        run,
    }));
    const findingItems = (project.findings || []).map((finding) => ({
        id: finding.id || `${finding.type}_${finding.createdAt}`,
        kind: finding.type || "finding",
        title: finding.title || typeLabel(finding.type),
        note: finding.note,
        sourceRunId: finding.sourceRunId,
        indent: Boolean(finding.sourceRunId),
        createdAt: finding.createdAt || "",
        status: finding.status,
        sweepType: finding.sweepType,
        raw: finding,
    }));
    return [...runItems, ...findingItems].sort((a, b) => {
        const aRank = a.role === "baseline" ? 0 : a.sourceRunId ? 2 : 1;
        const bRank = b.role === "baseline" ? 0 : b.sourceRunId ? 2 : 1;
        if (aRank !== bRank) return aRank - bRank;
        return String(a.createdAt).localeCompare(String(b.createdAt));
    });
}

function buildRrSweepSummary(plan, runs, getRunData) {
    const planResults = Array.isArray(plan?.results) ? plan.results : [];
    const explicitRunIds = new Set(planResults.map((result) => result.runId).filter(Boolean));
    const sourceRunId = plan?.sourceRunId;
    const rows = (runs || [])
        .filter((run) => {
            if (explicitRunIds.has(run.id)) return true;
            return run.experimentType === "rr" && (run.sourceRunId === sourceRunId || run.parentRunId === sourceRunId);
        })
        .map((run) => {
            const bundle = getRunData(run.id);
            const rr = Number(bundle?.config?.rr_multiple ?? bundle?.summary?.rr ?? run.rr);
            const trades = Number(run.trades || bundle?.summary?.trades || 0);
            const netR = Number(run.netR ?? bundle?.summary?.netR ?? 0);
            const expectancy = Number.isFinite(Number(run.expectancy))
                ? Number(run.expectancy)
                : trades ? netR / trades : null;
            return {
                run,
                rr,
                netR,
                winRate: Number(run.winRate ?? bundle?.summary?.winRate ?? 0),
                trades,
                maxDd: computeMaxDrawdownFromBundle(bundle),
                expectancy,
                validation: Number.isFinite(Number(run.validation)) ? Number(run.validation) : null,
            };
        })
        .sort((a, b) => a.rr - b.rr);

    const bestNetR = rows.reduce((best, row) => (!best || row.netR > best.netR ? row : best), null);
    const withExpectancy = rows.filter((row) => row.expectancy != null);
    const bestExpectancy = withExpectancy.reduce((best, row) => (!best || row.expectancy > best.expectancy ? row : best), null);
    const withDd = rows.filter((row) => row.maxDd != null);
    const lowestDd = withDd.reduce((best, row) => (!best || Math.abs(row.maxDd) < Math.abs(best.maxDd) ? row : best), null);
    return {
        rows,
        bestNetRId: bestNetR?.run.id || null,
        bestExpectancyId: bestExpectancy?.run.id || null,
        lowestDdId: lowestDd?.run.id || null,
    };
}

function buildProtectionSweepSummary(plan, runs, getRunData) {
    const planResults = Array.isArray(plan?.results) ? plan.results : [];
    const explicitRunIds = new Set(planResults.map((result) => result.runId).filter(Boolean));
    const resultMeta = new globalThis.Map(planResults.map((result) => [result.runId, result]));
    const sourceRunId = plan?.sourceRunId;
    const rows = (runs || [])
        .filter((run) => {
            if (explicitRunIds.has(run.id)) return true;
            return run.experimentType === "protection" && (run.sourceRunId === sourceRunId || run.parentRunId === sourceRunId);
        })
        .map((run) => {
            const bundle = getRunData(run.id);
            const meta = resultMeta.get(run.id) || {};
            const trades = Number(run.trades || bundle?.summary?.trades || 0);
            const netR = Number(run.netR ?? bundle?.summary?.netR ?? 0);
            const expectancy = Number.isFinite(Number(run.expectancy))
                ? Number(run.expectancy)
                : trades ? netR / trades : null;
            return {
                run,
                protectionMode: run.protectionMode || bundle?.protectionMode || bundle?.summary?.protectionMode || meta.mode || meta.protectionMode || bundle?.config?.protection_modes?.[0],
                threshold: run.protectionThreshold ?? bundle?.protectionThreshold ?? bundle?.summary?.protectionThreshold ?? meta.threshold,
                buffer: run.protectionBuffer ?? bundle?.protectionBuffer ?? bundle?.summary?.protectionBuffer ?? meta.buffer,
                netR,
                winRate: Number(run.winRate ?? bundle?.summary?.winRate ?? 0),
                trades,
                maxDd: computeMaxDrawdownFromBundle(bundle),
                expectancy,
                validation: Number.isFinite(Number(run.validation)) ? Number(run.validation) : null,
            };
        })
        .sort((a, b) => protectionSortKey(a) - protectionSortKey(b));

    const bestNetR = rows.reduce((best, row) => (!best || row.netR > best.netR ? row : best), null);
    const withExpectancy = rows.filter((row) => row.expectancy != null);
    const bestExpectancy = withExpectancy.reduce((best, row) => (!best || row.expectancy > best.expectancy ? row : best), null);
    const withDd = rows.filter((row) => row.maxDd != null);
    const lowestDd = withDd.reduce((best, row) => (!best || Math.abs(row.maxDd) < Math.abs(best.maxDd) ? row : best), null);
    return {
        rows,
        bestNetRId: bestNetR?.run.id || null,
        bestExpectancyId: bestExpectancy?.run.id || null,
        lowestDdId: lowestDd?.run.id || null,
    };
}

function computeMaxDrawdownFromBundle(bundle) {
    const curve = bundle?.equityCurve || Object.values(bundle?.equityCurveByVariant || {})[0] || [];
    if (!Array.isArray(curve) || !curve.length) return null;
    let peak = Number(curve[0]?.netR) || 0;
    let maxDd = 0;
    curve.forEach((point) => {
        const value = Number(point?.netR) || 0;
        peak = Math.max(peak, value);
        maxDd = Math.min(maxDd, value - peak);
    });
    return maxDd;
}

function formatNumber(value, digits = 1) {
    const n = Number(value);
    return Number.isFinite(n) ? n.toFixed(digits) : "—";
}

function itemLabel(item) {
    if (item.kind === "run") return roleLabel(item.role);
    if (item.kind === "sweep_plan") return "Sweep Plan";
    if (item.kind === "question") return "Question";
    return "Finding";
}

function itemTone(item) {
    if (item.kind === "run") return roleTone(item.role);
    if (item.kind === "sweep_plan") return "secondary";
    if (item.kind === "question") return "warning";
    return "primary";
}

async function waitForSidecarJob(jobId) {
    for (;;) {
        await delay(2000);
        const job = await getSidecarRun(jobId);
        if (!["queued", "running"].includes(job.status)) return job;
    }
}

function delay(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function buildRrSweepConfig(sourceBundle, sourceRun, rr) {
    const cfg = sourceBundle?.config || {};
    const config = buildBaseSidecarConfig(sourceBundle, sourceRun);
    return {
        ...config,
        rr_multiple: Number(rr),
        protection_modes: ["baseline"],
    };
}

function buildProtectionSweepConfig(sourceBundle, sourceRun, protection) {
    const config = buildBaseSidecarConfig(sourceBundle, sourceRun);
    const next = {
        ...config,
        protection_modes: [protection.mode || "baseline"],
    };
    if (protection.mode === "penetration_threshold_exit" && protection.threshold != null) {
        next.penetration_thresholds = [Number(protection.threshold)];
    }
    if (protection.mode === "close_confirmed_ob_breach_exit" && protection.buffer != null) {
        next.close_breach_buffers_pips = [Number(protection.buffer)];
    }
    return next;
}

function buildBaseSidecarConfig(sourceBundle, sourceRun) {
    const cfg = sourceBundle?.config || {};
    const config = {
        symbol: cfg.symbol || sourceRun?.symbol || sourceBundle?.summary?.symbol || "EURUSD",
        candle_file: cfg.candle_file || cfg.candleFile || "EURUSD_1m.csv",
        detection_timeframe: cfg.detection_timeframe || cfg.detection_tf || sourceRun?.detectionTf || sourceBundle?.summary?.detectionTf || "15min",
        execution_timeframe: cfg.execution_timeframe || cfg.execution_tf || sourceRun?.executionTf || sourceBundle?.summary?.executionTf || "1min",
        start_date: cfg.start_date || cfg.date_from || sourceBundle?.summary?.date_from,
        end_date: cfg.end_date || cfg.date_to || sourceBundle?.summary?.date_to,
        rr_multiple: Number(cfg.rr_multiple || sourceRun?.rr || sourceBundle?.summary?.rr || 3.3),
        swing_length: cfg.swing_length,
        ob_filter: cfg.ob_filter,
        entry_buffer_pips: cfg.entry_buffer_pips,
        stop_buffer_pips: cfg.stop_buffer_pips,
        verify_limit_ticks: cfg.verify_limit_ticks,
        execution_modes: [sourceRun?.executionMode || sourceBundle?.primaryVariant || "single_position"],
        entry_models: ["baseline"],
        protection_modes: ["baseline"],
        news_blackout_enabled: Boolean(cfg.news_blackout_enabled),
    };
    if (cfg.news_blackout_enabled) {
        config.news_file = cfg.news_file;
        config.news_blackout_minutes_before = cfg.news_blackout_minutes_before;
        config.news_blackout_minutes_after = cfg.news_blackout_minutes_after;
        config.news_blackout_impacts = cfg.news_blackout_impacts;
        config.news_blackout_currencies = cfg.news_blackout_currencies;
    }
    return Object.fromEntries(Object.entries(config).filter(([, value]) => value !== undefined && value !== null && value !== ""));
}

function parseRrValues(value) {
    const parsed = String(value || "")
        .split(",")
        .map((part) => Number(part.trim()))
        .filter((n) => Number.isFinite(n) && n > 0);
    return parsed.length ? [...new Set(parsed)] : [2, 2.5, 3, 3.3, 3.5, 4];
}

function normalizeSweepType(value) {
    const text = String(value || "").toLowerCase();
    if (text.includes("rr")) return "rr";
    if (text.includes("entry")) return "entry";
    if (text.includes("protection")) return "protection";
    if (text.includes("origin")) return "ob_origin_session";
    if (text.includes("detection")) return "ob_detection_session";
    if (text.includes("session")) return "session";
    if (text.includes("news")) return "news";
    return "manual";
}

function protectionLabel(protection) {
    if (protection.label) return protection.label;
    if (protection.mode === "penetration_threshold_exit") return `Penetration ${protection.threshold}%`;
    if (protection.mode === "close_confirmed_ob_breach_exit") return `Close Confirmed ${protection.buffer} pip`;
    return protectionModeLabel(protection.mode);
}

function protectionModeLabel(mode) {
    return {
        baseline: "Baseline",
        full_ob_breach_exit: "Full OB Breach",
        penetration_threshold_exit: "Penetration Threshold",
        close_confirmed_ob_breach_exit: "Close-Confirmed Breach",
    }[mode] || mode || "Protection";
}

function protectionThresholdLabel(row) {
    if (row.protectionMode === "penetration_threshold_exit" && row.threshold != null) return `${row.threshold}%`;
    if (row.protectionMode === "close_confirmed_ob_breach_exit" && row.buffer != null) return `${row.buffer} pip`;
    return "—";
}

function protectionSortKey(row) {
    if (row.protectionMode === "baseline") return 0;
    if (row.protectionMode === "full_ob_breach_exit") return 1;
    if (row.protectionMode === "penetration_threshold_exit") return 10 + Number(row.threshold || 0) / 100;
    if (row.protectionMode === "close_confirmed_ob_breach_exit") return 20 + Number(row.buffer || 0);
    return 99;
}

function formatError(error) {
    const message = error?.message || String(error || "Unknown error");
    if (message.toLowerCase().includes("failed to fetch")) return "Sidecar offline. Start the local sidecar and try again.";
    return message;
}

function runById(runs, id) {
    if (!id) return null;
    return runs.find((run) => run.id === id) || null;
}

function roleFor(run) {
    return run.runRole || "imported";
}

function roleLabel(role) {
    return {
        baseline: "Baseline",
        variant: "Variant",
        sweep_result: "Sweep Result",
        candidate: "Candidate",
        final: "Final",
        imported: "Imported",
    }[role] || role;
}

function roleTone(role) {
    return {
        baseline: "primary",
        candidate: "warning",
        final: "success",
        variant: "secondary",
        sweep_result: "muted",
        imported: "muted",
    }[role] || "muted";
}

function typeLabel(type) {
    return {
        finding: "Finding",
        question: "Question",
        sweep_plan: "Sweep Plan",
    }[type] || "Finding";
}

function formatDateTime(value) {
    const date = new Date(value);
    if (!isFinite(date.getTime())) return "—";
    return date.toLocaleDateString("en", { day: "2-digit", month: "short", year: "2-digit" });
}
