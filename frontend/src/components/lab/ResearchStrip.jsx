/**
 * ResearchStrip — shared research-workflow cockpit (COCKPIT-1).
 *
 * Extracted verbatim from RunDetail (WF-2…WF-6) so the same strip can be
 * surfaced on multiple surfaces (Run Workspace + Overview) without duplicating
 * logic. Presentational + prop-driven: it computes nothing except its own
 * collapse state. The host page computes nextStep / runReference / deltaRows via
 * the pure helpers in data/projectWorkflow.js and passes them in.
 *
 * Bundles four cards (NextStep · WhatChanged · SaveFinding · RecentFindings)
 * into one compact, collapsible strip. Each card renders in `embedded` mode.
 *
 * Props
 *   project, projectId, runId, runRole   linked-project context (project may be null)
 *   nextStep                             getNextStep() output (or null)
 *   runReference                         resolveRunReference() output ({ run, reason })
 *   deltaRows                            buildRunDelta() output ([] when no reference)
 *   runs                                 RUNS list (for finding source labels)
 *   storageKey                           localStorage key for collapse state
 *                                        (default = the Run Workspace key, so
 *                                        RunDetail behavior is unchanged; other
 *                                        surfaces pass a distinct key)
 */

import React from "react";
import { Link } from "react-router-dom";
import {
    FlaskConical, ChevronDown, Compass, FolderKanban, ArrowRight,
    GitCompareArrows, Lightbulb, Check,
} from "lucide-react";
import { NeonButton } from "@/components/lab/controls";
import { Pill } from "@/components/lab/DataTable";
import { setActiveProjectId, addProjectFinding, getRunDisplayName } from "@/data/store";
import { referenceReasonLabel } from "@/data/projectWorkflow";

// WF-2: compact "operational hub" cue. Tells the user which project the run
// belongs to, its role, and the project's recommended next step. Falls back to
// a gentle "link to a project" prompt when the run is unassigned. Intentionally
// small — not a full What-Changed panel (deferred to a later phase).
const RUN_ROLE_META = {
    baseline:  { label: "Baseline",  tone: "primary" },
    candidate: { label: "Candidate", tone: "secondary" },
    final:     { label: "Final",     tone: "success" },
};

// WF-6: consolidate the four workflow cards (Next Step, What Changed, Save
// Finding, Recent Findings) into one compact, collapsible "Research" strip so
// they don't push the run analytics too far down. Presentational only — each
// card renders in `embedded` mode (no individual outer spacing) and keeps its
// own logic/props unchanged.
const RESEARCH_STRIP_KEY = "fxob_run_research_strip_open_v1";

export function ResearchStrip({ project, projectId, runId, runRole, nextStep, runReference, deltaRows, runs, storageKey = RESEARCH_STRIP_KEY }) {
    const [open, setOpen] = React.useState(() => {
        try {
            const stored = localStorage.getItem(storageKey);
            return stored === null ? false : stored === "true";
        } catch {
            return false;
        }
    });
    React.useEffect(() => {
        try { localStorage.setItem(storageKey, String(open)); } catch { /* non-critical */ }
    }, [open, storageKey]);

    const roleMeta = project ? (RUN_ROLE_META[runRole] || { label: "Unassigned", tone: "muted" }) : null;

    return (
        <div className="px-6 mb-3" data-testid="run-research-strip">
            <div className="border border-[hsl(var(--border-soft)/0.7)] bg-[hsl(var(--panel-2)/0.25)] clip-bevel-sm">
                <button
                    type="button"
                    data-testid="research-strip-toggle"
                    onClick={() => setOpen((v) => !v)}
                    aria-expanded={open}
                    className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-[hsl(var(--panel-2)/0.4)] transition-colors"
                >
                    <FlaskConical className="w-3.5 h-3.5 text-[hsl(var(--accent-secondary))] shrink-0" />
                    <span className="text-[10px] font-ui uppercase tracking-[0.18em] text-muted-lab shrink-0">Research</span>
                    {project ? (
                        <span className="inline-flex items-center gap-2 min-w-0">
                            <span className="font-ui text-[11.5px] text-white truncate" title={project.name}>{project.name}</span>
                            {roleMeta && <Pill tone={roleMeta.tone}>{roleMeta.label}</Pill>}
                        </span>
                    ) : (
                        <span className="font-ui text-[11px] text-muted-lab truncate">No project linked</span>
                    )}
                    {nextStep?.title && (
                        <span className="hidden md:inline text-[11px] text-[hsl(var(--text-2))] truncate" title={nextStep.copy || ""}>
                            · Next: {nextStep.title}
                        </span>
                    )}
                    <span className="flex-1" />
                    <span className="text-[10px] font-ui uppercase tracking-wider text-muted-lab shrink-0 hidden sm:inline">
                        {open ? "Collapse" : "Expand"}
                    </span>
                    <ChevronDown className={`w-4 h-4 text-muted-lab shrink-0 transition-transform ${open ? "" : "-rotate-90"}`} />
                </button>

                {open && (
                    <div className="px-3 pb-3 pt-1 space-y-2 border-t border-[hsl(var(--border-soft))]">
                        <NextStepCard
                            embedded
                            project={project}
                            projectId={projectId}
                            runRole={runRole}
                            nextStep={nextStep}
                        />
                        <WhatChangedCard
                            embedded
                            reason={runReference.reason}
                            reference={runReference.run}
                            rows={deltaRows}
                        />
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
                            <SaveFindingCard
                                embedded
                                project={project}
                                projectId={projectId}
                                runId={runId}
                            />
                            <RecentFindingsCard
                                embedded
                                project={project}
                                projectId={projectId}
                                runId={runId}
                                runs={runs}
                            />
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

function NextStepCard({ project, projectId, runRole, nextStep, embedded = false }) {
    const wrapperClass = embedded ? "" : "px-6 mb-3";
    // No project linked → non-blocking prompt to organize this run.
    if (!project) {
        return (
            <div className={wrapperClass} data-testid="run-next-step-card">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border border-dashed border-[hsl(var(--border-mid))] bg-[hsl(var(--panel-2)/0.25)] clip-bevel-sm px-3 py-2">
                    <Compass className="w-3.5 h-3.5 text-muted-lab" />
                    <span className="text-[10px] font-ui uppercase tracking-[0.18em] text-muted-lab">No Project Linked</span>
                    <span className="text-[11.5px] text-[hsl(var(--text-2))]">
                        Link this run to a project to track baseline, candidates, and next steps.
                    </span>
                    <span className="flex-1" />
                    <Link to="/projects">
                        <NeonButton icon={FolderKanban} tone="ghost">Open Projects</NeonButton>
                    </Link>
                </div>
            </div>
        );
    }

    const roleMeta = RUN_ROLE_META[runRole] || { label: "Unassigned", tone: "muted" };
    const goProject = () => setActiveProjectId(project.id);
    // Sweep-plan steps open a modal that only exists on the project page, so on
    // the Run Workspace we route to the project instead of trying to open it.
    const target = nextStep?.to || `/projects/${encodeURIComponent(projectId)}`;
    const handleNavigate = nextStep?.activateProject ? goProject : undefined;

    return (
        <div className={wrapperClass} data-testid="run-next-step-card">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border border-[hsl(var(--accent-secondary)/0.35)] bg-[hsl(var(--accent-secondary)/0.05)] clip-bevel-sm px-3 py-2.5">
                <span className="inline-flex items-center gap-2 min-w-0">
                    <Compass className="w-3.5 h-3.5 text-[hsl(var(--accent-secondary))] shrink-0" />
                    <span className="text-[10px] font-ui uppercase tracking-[0.18em] text-muted-lab shrink-0">Project</span>
                    <Link
                        to={`/projects/${encodeURIComponent(projectId)}`}
                        className="font-ui text-[12px] text-white truncate hover:text-[hsl(var(--accent-secondary))]"
                        title={project.name}
                    >
                        {project.name}
                    </Link>
                    <Pill tone={roleMeta.tone}>{roleMeta.label}</Pill>
                </span>

                <span className="hidden md:block h-4 w-px bg-[hsl(var(--border-soft))]" />

                <span className="inline-flex items-center gap-2 min-w-0 flex-1">
                    <span className="text-[10px] font-ui uppercase tracking-[0.18em] text-[hsl(var(--accent-secondary))] shrink-0">Next</span>
                    <span className="text-[12px] text-white truncate" title={nextStep?.copy || ""}>
                        {nextStep?.title || "Continue research"}
                    </span>
                </span>

                <span className="flex items-center gap-2 shrink-0">
                    <Link to={target} onClick={handleNavigate}>
                        <NeonButton icon={ArrowRight} tone="secondary">{nextStep?.action || "Open Project"}</NeonButton>
                    </Link>
                    <Link to={`/projects/${encodeURIComponent(projectId)}`} onClick={goProject}>
                        <NeonButton icon={FolderKanban} tone="ghost">Record Findings</NeonButton>
                    </Link>
                </span>
            </div>
        </div>
    );
}

// WF-3: compact headline delta vs the most relevant reference run. Orientation
// aid only — not a verdict, and not a replacement for Comparison Lab. Reads
// existing summary metrics; renders a calm empty state when no reference exists.
function formatDeltaMetric(row) {
    if (row.current == null) return "—";
    return `${row.current.toFixed(row.digits)}${row.unit}`;
}

function formatDeltaChange(row) {
    if (row.delta == null) return null;
    const sign = row.delta > 0 ? "+" : "";
    return `${sign}${row.delta.toFixed(row.digits)}${row.unit}`;
}

function WhatChangedCard({ reason, reference, rows, embedded = false }) {
    const wrapperClass = embedded ? "" : "px-6 mb-3";
    const label = referenceReasonLabel(reason);

    if (!reference || !rows || rows.length === 0) {
        return (
            <div className={wrapperClass} data-testid="run-what-changed-card">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border border-dashed border-[hsl(var(--border-mid))] bg-[hsl(var(--panel-2)/0.25)] clip-bevel-sm px-3 py-2">
                    <GitCompareArrows className="w-3.5 h-3.5 text-muted-lab" />
                    <span className="text-[10px] font-ui uppercase tracking-[0.18em] text-muted-lab">What Changed?</span>
                    <span className="text-[11.5px] text-[hsl(var(--text-2))]">No reference run yet.</span>
                </div>
            </div>
        );
    }

    const toneClass = (direction) =>
        direction === "up" ? "text-[hsl(var(--success))]" :
        direction === "down" ? "text-[hsl(var(--danger))]" :
        "text-muted-lab";

    return (
        <div className={wrapperClass} data-testid="run-what-changed-card">
            <div className="border border-[hsl(var(--border-soft)/0.7)] bg-[hsl(var(--panel-2)/0.35)] clip-bevel-sm px-3 py-2.5">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 mb-2">
                    <GitCompareArrows className="w-3.5 h-3.5 text-[hsl(var(--accent-secondary))]" />
                    <span className="text-[10px] font-ui uppercase tracking-[0.18em] text-muted-lab">What Changed?</span>
                    <span className="text-[11px] font-ui text-white truncate" title={reference.displayName || reference.id}>
                        {label}
                    </span>
                    <span className="text-[10.5px] text-muted-lab truncate max-w-[220px]" title={reference.displayName || reference.id}>
                        · {reference.displayName || reference.id}
                    </span>
                </div>

                <div className="flex flex-wrap gap-2">
                    {rows.map((row) => (
                        <div
                            key={row.key}
                            className="inline-flex flex-col gap-0.5 border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel)/0.5)] clip-bevel-sm px-2.5 py-1.5 min-w-[84px]"
                            title={row.reference != null ? `Reference: ${row.reference.toFixed(row.digits)}${row.unit}` : "No reference value"}
                        >
                            <span className="text-[9px] font-ui uppercase tracking-[0.16em] text-muted-lab">{row.label}</span>
                            <span className="font-num text-[12px] text-white">{formatDeltaMetric(row)}</span>
                            <span className={`font-num text-[10.5px] ${toneClass(row.direction)}`}>
                                {formatDeltaChange(row) || (row.direction === "na" ? "n/a" : "—")}
                            </span>
                        </div>
                    ))}
                </div>

                <div className="mt-2 text-[10px] text-muted-lab">
                    Headline comparison only. Use Comparison Lab / Table Compare for deeper analysis.
                </div>
            </div>
        </div>
    );
}

// WF-4: smallest useful insight-capture flow. Appends a free-text finding to
// the linked project, reusing the existing findings model (so it renders in
// ProjectDetail unchanged). No editing, no tags UI, no global Insights store.
function SaveFindingCard({ project, projectId, runId, embedded = false }) {
    const wrapperClass = embedded ? "" : "px-6 mb-3";
    const [text, setText] = React.useState("");
    const [saved, setSaved] = React.useState(false);

    // No project → calm prompt, never blocks the page.
    if (!project) {
        return (
            <div className={wrapperClass} data-testid="run-save-finding-card">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border border-dashed border-[hsl(var(--border-mid))] bg-[hsl(var(--panel-2)/0.25)] clip-bevel-sm px-3 py-2">
                    <Lightbulb className="w-3.5 h-3.5 text-muted-lab" />
                    <span className="text-[10px] font-ui uppercase tracking-[0.18em] text-muted-lab">Findings</span>
                    <span className="text-[11.5px] text-[hsl(var(--text-2))]">Link this run to a project to save findings.</span>
                    <span className="flex-1" />
                    <Link to="/projects">
                        <NeonButton icon={FolderKanban} tone="ghost">Open Projects</NeonButton>
                    </Link>
                </div>
            </div>
        );
    }

    const canSave = text.trim().length > 0;
    const onSave = () => {
        if (!canSave) return;
        const entry = addProjectFinding(projectId, { note: text, sourceRunId: runId, runId });
        if (entry) {
            setText("");
            setSaved(true);
        }
    };

    return (
        <div className={wrapperClass} data-testid="run-save-finding-card">
            <div className="border border-[hsl(var(--border-soft)/0.7)] bg-[hsl(var(--panel-2)/0.35)] clip-bevel-sm px-3 py-2.5">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 mb-2">
                    <Lightbulb className="w-3.5 h-3.5 text-[hsl(var(--accent-secondary))]" />
                    <span className="text-[10px] font-ui uppercase tracking-[0.18em] text-muted-lab">What did you learn from this run?</span>
                    <span className="text-[10.5px] text-muted-lab truncate max-w-[200px]" title={project.name}>· {project.name}</span>
                    {saved && (
                        <span className="inline-flex items-center gap-1 text-[10.5px] font-ui text-[hsl(var(--success))]" data-testid="finding-saved-state">
                            <Check className="w-3 h-3" /> Saved to project
                        </span>
                    )}
                </div>
                <div className="flex items-start gap-2">
                    <textarea
                        data-testid="finding-input"
                        value={text}
                        onChange={(e) => { setText(e.target.value); if (saved) setSaved(false); }}
                        rows={2}
                        placeholder="e.g. London session OB entries underperform on high-impact news days."
                        className="flex-1 resize-y bg-[hsl(var(--panel)/0.6)] border border-[hsl(var(--border-soft))] clip-bevel-sm px-2.5 py-1.5 text-[12px] text-white outline-none focus:border-[hsl(var(--accent-primary)/0.5)] placeholder:text-muted-lab"
                    />
                    <div className="shrink-0">
                        <NeonButton
                            icon={Lightbulb}
                            tone="secondary"
                            onClick={onSave}
                            disabled={!canSave}
                            className={!canSave ? "opacity-40 cursor-not-allowed" : undefined}
                        >
                            Save Finding
                        </NeonButton>
                    </div>
                </div>
                <div className="mt-1.5 text-[10px] text-muted-lab">
                    Saved findings appear in this project. Open the project to review or delete them.
                </div>
            </div>
        </div>
    );
}

// WF-5: read-only recall of recent findings so capture and recall sit together.
// Current-run findings are prioritized, then the latest project findings fill up
// to 3 slots. No editing/deleting here — that stays in ProjectDetail.
function formatFindingDate(value) {
    const date = new Date(value);
    if (!isFinite(date.getTime())) return "—";
    return date.toLocaleDateString("en", { day: "2-digit", month: "short", year: "2-digit" });
}

const FINDING_TYPE_LABEL = { finding: "Finding", question: "Question", sweep_plan: "Sweep Plan" };

function selectRecentFindings(findings, runId, max = 3) {
    const list = Array.isArray(findings) ? findings.filter(Boolean) : [];
    const isCurrent = (f) => (f.sourceRunId && f.sourceRunId === runId) || (f.runId && f.runId === runId);
    const current = list.filter(isCurrent);
    const others = list.filter((f) => !isCurrent(f));
    // `findings` is already stored newest-first; concat preserves that ordering
    // within each group while keeping current-run findings ahead of the rest.
    return [...current, ...others].slice(0, max);
}

function RecentFindingsCard({ project, projectId, runId, runs, embedded = false }) {
    const wrapperClass = embedded ? "" : "px-6 mb-3";
    // No project → keep it light (the Save card already explains linking).
    if (!project) {
        return (
            <div className={wrapperClass} data-testid="run-recent-findings-card">
                <div className="text-[10.5px] text-muted-lab px-1">Recent findings appear here once this run is linked to a project.</div>
            </div>
        );
    }

    const findings = project.findings || [];
    const recent = selectRecentFindings(findings, runId, 3);
    const runLabel = (id) => {
        if (!id) return "";
        const match = (runs || []).find((r) => r.id === id);
        return match ? getRunDisplayName(match) : id;
    };

    return (
        <div className={wrapperClass} data-testid="run-recent-findings-card">
            <div className="border border-[hsl(var(--border-soft)/0.7)] bg-[hsl(var(--panel-2)/0.35)] clip-bevel-sm px-3 py-2.5">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 mb-2">
                    <Lightbulb className="w-3.5 h-3.5 text-[hsl(var(--accent-secondary))]" />
                    <span className="text-[10px] font-ui uppercase tracking-[0.18em] text-muted-lab">Recent Findings</span>
                    <span className="flex-1" />
                    <Link
                        to={`/projects/${encodeURIComponent(projectId)}`}
                        className="text-[10px] font-ui uppercase tracking-wider text-[hsl(var(--accent-secondary))] hover:text-white"
                    >
                        View all findings →
                    </Link>
                </div>

                {recent.length === 0 ? (
                    <div className="text-[11.5px] text-[hsl(var(--text-2))]">No findings saved yet.</div>
                ) : (
                    <div className="space-y-1.5">
                        {recent.map((finding) => {
                            const isCurrent = (finding.sourceRunId && finding.sourceRunId === runId) || (finding.runId && finding.runId === runId);
                            const sourceId = finding.sourceRunId || finding.runId || "";
                            const typeText = finding.tag || FINDING_TYPE_LABEL[finding.type] || "Finding";
                            const body = finding.note || finding.title || "—";
                            return (
                                <div
                                    key={finding.id || `${finding.createdAt}-${finding.title}`}
                                    className="flex items-start gap-2 border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel)/0.45)] clip-bevel-sm px-2.5 py-1.5"
                                >
                                    <Pill tone={finding.type === "question" ? "warning" : finding.type === "sweep_plan" ? "secondary" : "primary"}>
                                        {typeText}
                                    </Pill>
                                    <div className="min-w-0 flex-1">
                                        <p className="text-[12px] text-white leading-relaxed whitespace-pre-wrap break-words">{body}</p>
                                        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[10px] font-ui text-muted-lab">
                                            <span>{formatFindingDate(finding.createdAt)}</span>
                                            {!isCurrent && sourceId && (
                                                <span className="truncate max-w-[200px]" title={runLabel(sourceId)}>· {runLabel(sourceId)}</span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}

export default ResearchStrip;
