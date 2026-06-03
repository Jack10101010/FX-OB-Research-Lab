import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { LabRunHero } from "@/components/lab/LabRunHero";
import { NeonPanel } from "@/components/lab/NeonPanel";
import { DataTable, Pill } from "@/components/lab/DataTable";
import { Field, NeonInput, NeonSelect, NeonButton } from "@/components/lab/controls";
import { createResearchProject, deleteProject, setActiveProjectId, updateResearchProject, useDataset } from "@/data/store";
import { Check, CheckCircle2, Edit3, FolderOpen, FolderPlus, Play, Target, Trash2, X } from "lucide-react";

export default function Projects() {
    const { PROJECTS, activeProjectId } = useDataset();
    const [symbol, setSymbol] = useState("EURUSD");
    const [timeframe, setTimeframe] = useState("M15");
    const [name, setName] = useState("");
    // PROJECTS-1B: inline rename state
    const [editingProjectId, setEditingProjectId] = useState("");
    const [editProjectName, setEditProjectName] = useState("");

    const defaultName = `${symbol} ${timeframe} Research`;
    const rows = useMemo(() => PROJECTS || [], [PROJECTS]);

    const createProject = () => {
        const project = createResearchProject({
            name: (name || defaultName).trim(),
            symbol,
            timeframe,
        });
        setName("");
        setActiveProjectId(project.id);
    };

    const startRenameProject = (event, project) => {
        event?.preventDefault();
        event?.stopPropagation();
        setEditingProjectId(project.id);
        setEditProjectName(project.name || "");
    };
    const cancelRenameProject = (event) => {
        event?.preventDefault();
        event?.stopPropagation();
        setEditingProjectId("");
        setEditProjectName("");
    };
    const saveRenameProject = (event) => {
        event?.preventDefault();
        event?.stopPropagation();
        const trimmed = editProjectName.trim();
        if (!editingProjectId || !trimmed) return;
        updateResearchProject(editingProjectId, { name: trimmed });
        setEditingProjectId("");
        setEditProjectName("");
    };
    const handleDeleteProject = (event, project) => {
        event?.preventDefault();
        event?.stopPropagation();
        if (!window.confirm("Delete project? Runs will be unassigned but not deleted.")) return;
        if (editingProjectId === project.id) cancelRenameProject();
        deleteProject(project.id);
    };

    return (
        <div className="pb-12">
            <LabRunHero
                pageLabel="Research Projects"
                title="Projects"
                description="Start with a project, then add baseline, variants, candidates, and final validated configs."
                actions={
                    <Link to="/strategy">
                        <NeonButton icon={Play} tone="primary">Open Strategy Builder</NeonButton>
                    </Link>
                }
            />

            <div className="px-6 grid grid-cols-1 xl:grid-cols-3 gap-4">
                <NeonPanel title="Create New Project">
                    <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-1 gap-3">
                        <Field label="Symbol">
                            <NeonSelect value={symbol} onChange={setSymbol} options={["EURUSD", "GBPUSD", "USDJPY", "XAUUSD", "AUDUSD", "NZDUSD", "USDCAD"]} />
                        </Field>
                        <Field label="Timeframe">
                            <NeonSelect value={timeframe} onChange={setTimeframe} options={["M5", "M15", "M30", "H1", "H4"]} />
                        </Field>
                        <Field label="Project Name">
                            <NeonInput value={name} onChange={(event) => setName(event.target.value)} placeholder={defaultName} />
                        </Field>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                        <NeonButton icon={FolderPlus} tone="secondary" onClick={createProject}>
                            Create Project
                        </NeonButton>
                        <Pill tone="muted">{defaultName}</Pill>
                    </div>
                </NeonPanel>

                <NeonPanel className="xl:col-span-2" title="Project Workflow">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                        {[
                            ["1", "Create Project", "Define symbol/timeframe research scope."],
                            ["2", "Baseline Run", "Run or import the first clean baseline."],
                            ["3", "Experiments", "Attach entry, protection, news, and session variants."],
                            ["4", "Candidate", "Promote the best run toward validation."],
                        ].map(([step, title, copy]) => (
                            <div key={step} className="border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2)/0.35)] clip-bevel-sm px-3 py-3">
                                <div className="text-[9.5px] font-ui uppercase tracking-[0.14em] text-[hsl(var(--accent-secondary))]">Step {step}</div>
                                <div className="mt-1 font-display text-[14px] text-white">{title}</div>
                                <div className="mt-1 text-[11px] leading-relaxed text-[hsl(var(--text-2))]">{copy}</div>
                            </div>
                        ))}
                    </div>
                </NeonPanel>
            </div>

            <div className="px-6 mt-4">
                <NeonPanel title="Research Projects" action={<Pill tone="primary">{rows.length} PROJECTS</Pill>}>
                    <DataTable
                        testId="projects-table"
                        rowKey="id"
                        columns={[
                            { key: "name", label: "Project", render: (project) => {
                                const isEditing = editingProjectId === project.id;
                                if (isEditing) {
                                    return (
                                        <span className="flex items-center gap-1.5 min-w-[220px]">
                                            <NeonInput
                                                value={editProjectName}
                                                onChange={(e) => setEditProjectName(e.target.value)}
                                                onKeyDown={(e) => {
                                                    if (e.key === "Enter") { e.preventDefault(); saveRenameProject(); }
                                                    if (e.key === "Escape") { e.preventDefault(); cancelRenameProject(); }
                                                }}
                                                className="h-7 min-w-[180px]"
                                                autoFocus
                                            />
                                            <button
                                                type="button"
                                                onClick={saveRenameProject}
                                                className="grid place-items-center w-7 h-7 clip-bevel-sm border border-[hsl(var(--success)/0.55)] text-[hsl(var(--success))] bg-[hsl(var(--success)/0.08)]"
                                                aria-label="Save project name"
                                            >
                                                <Check className="w-3.5 h-3.5" />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={cancelRenameProject}
                                                className="grid place-items-center w-7 h-7 clip-bevel-sm border border-[hsl(var(--border-mid))] text-[hsl(var(--text-2))]"
                                                aria-label="Cancel rename"
                                            >
                                                <X className="w-3.5 h-3.5" />
                                            </button>
                                        </span>
                                    );
                                }
                                return (
                                    <span className="group/pname inline-flex items-center gap-2">
                                        <span className="text-[hsl(var(--accent-primary))]">{project.name}</span>
                                        {project.id === activeProjectId && <Pill tone="success">Active</Pill>}
                                        <button
                                            type="button"
                                            onClick={(e) => startRenameProject(e, project)}
                                            className="grid place-items-center w-6 h-6 opacity-0 group-hover/pname:opacity-100 clip-bevel-sm border border-[hsl(var(--border-mid))] text-[hsl(var(--text-2))] hover:border-[hsl(var(--accent-secondary))] hover:text-white transition-opacity"
                                            aria-label="Rename project"
                                        >
                                            <Edit3 className="w-3.5 h-3.5" />
                                        </button>
                                    </span>
                                );
                            } },
                            { key: "symbol", label: "Symbol" },
                            { key: "timeframe", label: "TF" },
                            { key: "status", label: "Status", render: (project) => <Pill tone={project.status === "validated" ? "success" : "muted"}>{project.status}</Pill> },
                            { key: "runIds", label: "Runs", align: "right", render: (project) => project.runIds?.length || 0 },
                            { key: "baselineRunId", label: "Baseline", render: (project) => project.baselineRunId || "—" },
                            { key: "candidateRunId", label: "Candidate", render: (project) => project.candidateRunId || "—" },
                            { key: "finalRunId", label: "Final", render: (project) => project.finalRunId || "—" },
                            { key: "checklist", label: "Progress", render: (project) => <ChecklistProgress project={project} /> },
                            { key: "updatedAt", label: "Updated", align: "right", render: (project) => formatUpdated(project.updatedAt) },
                            { key: "actions", label: "Actions", align: "right", render: (project) => (
                                <div className="flex items-center justify-end gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setActiveProjectId(project.id)}
                                        className="inline-flex items-center gap-1.5 px-2 py-1 text-[10px] font-ui uppercase tracking-wider border border-[hsl(var(--border-mid))] text-[hsl(var(--text-2))] hover:border-[hsl(var(--accent-secondary))] hover:text-white clip-bevel-sm"
                                    >
                                        <CheckCircle2 className="w-3 h-3" />
                                        Set Active
                                    </button>
                                    <Link
                                        to={`/projects/${encodeURIComponent(project.id)}`}
                                        className="inline-flex items-center gap-1.5 px-2 py-1 text-[10px] font-ui uppercase tracking-wider border border-[hsl(var(--accent-secondary)/0.45)] text-[hsl(var(--accent-secondary))] bg-[hsl(var(--accent-secondary)/0.06)] hover:bg-[hsl(var(--accent-secondary)/0.12)] clip-bevel-sm"
                                    >
                                        <FolderOpen className="w-3 h-3" />
                                        Open Project
                                    </Link>
                                    <Link
                                        to="/strategy"
                                        onClick={() => setActiveProjectId(project.id)}
                                        className="inline-flex items-center gap-1.5 px-2 py-1 text-[10px] font-ui uppercase tracking-wider border border-[hsl(var(--border-mid))] text-[hsl(var(--text-2))] hover:border-[hsl(var(--accent-primary)/0.55)] hover:text-[hsl(var(--accent-primary))] clip-bevel-sm"
                                    >
                                        <Target className="w-3 h-3" />
                                        {project.baselineRunId ? "Open Builder" : "Create Baseline"}
                                    </Link>
                                    <button
                                        type="button"
                                        onClick={(e) => handleDeleteProject(e, project)}
                                        className="grid place-items-center w-7 h-7 clip-bevel-sm border border-[hsl(var(--border-mid))] text-[hsl(var(--text-2))] hover:border-[hsl(var(--danger)/0.65)] hover:text-[hsl(var(--danger))]"
                                        aria-label="Delete project"
                                        title="Delete project. Runs will be unassigned but not deleted."
                                    >
                                        <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            ) },
                        ]}
                        rows={rows}
                    />
                    {!rows.length && (
                        <div className="py-10 text-center">
                            <div className="font-ui text-[10px] uppercase tracking-[0.14em] text-muted-lab">No Projects Yet</div>
                            <div className="mt-2 text-[12px] text-[hsl(var(--text-2))]">Create a research project to start grouping baseline and experiment runs.</div>
                        </div>
                    )}
                </NeonPanel>
            </div>
        </div>
    );
}

function ChecklistProgress({ project }) {
    const checklist = project.checklist || {};
    const values = Object.values(checklist);
    const total = values.length || 1;
    const done = values.filter(Boolean).length;
    return (
        <span className="inline-flex items-center gap-2">
            <span className="text-white font-num text-[11px] tabular-nums">{done}/{total}</span>
            <span className="w-16 h-1.5 bg-[hsl(var(--panel-2))] border border-[hsl(var(--border-soft))]">
                <span className="block h-full bg-[hsl(var(--accent-primary))]" style={{ width: `${(done / total) * 100}%` }} />
            </span>
        </span>
    );
}

function formatUpdated(value) {
    const date = new Date(value);
    if (!isFinite(date.getTime())) return "—";
    return date.toLocaleDateString("en", { day: "2-digit", month: "short", year: "2-digit" });
}
