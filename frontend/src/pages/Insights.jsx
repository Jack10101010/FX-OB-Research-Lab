import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { FolderKanban, Activity } from "lucide-react";
import { LabRunHero } from "@/components/lab/LabRunHero";
import { NeonPanel } from "@/components/lab/NeonPanel";
import { Pill } from "@/components/lab/DataTable";
import { getRunDisplayName, useDataset } from "@/data/store";
import { classifyFindingSource, FINDING_SOURCE_FILTERS } from "@/data/projectWorkflow";

// INS-2 — read-only global Insights page. Aggregates every project's findings
// into one newest-first list with source + project filters. No storage changes,
// no edit/delete, no search/grouping (reserved for later phases).

const TYPE_LABEL = { finding: "Finding", question: "Question", sweep_plan: "Sweep Plan" };

// INS-3 — read-only grouping of the (already-filtered) findings list.
const GROUP_MODES = [
    { value: "flat", label: "Flat" },
    { value: "project", label: "By Project" },
    { value: "source", label: "By Source" },
];
const SOURCE_GROUP_LABEL = { manual: "Manual", run_workspace: "Run Workspace", table_compare: "Table Compare", edge_explorer: "Edge Explorer", comparison: "Comparison" };
// Stable display order for source groups.
const SOURCE_GROUP_ORDER = ["manual", "run_workspace", "table_compare", "edge_explorer", "comparison"];

function formatDateTime(value) {
    const date = new Date(value);
    if (!isFinite(date.getTime())) return "—";
    return date.toLocaleDateString("en", { day: "2-digit", month: "short", year: "2-digit" });
}

export default function Insights() {
    const { PROJECTS, RUNS } = useDataset();
    const [sourceFilter, setSourceFilter] = useState("all");
    const [projectFilter, setProjectFilter] = useState("all");
    const [groupMode, setGroupMode] = useState("flat");

    // Resolve run display names without assuming a run still exists.
    const runLabel = useMemo(() => {
        const map = new Map((RUNS || []).map((r) => [r.id, getRunDisplayName(r)]));
        return (id) => (id ? (map.get(id) || id) : "");
    }, [RUNS]);

    // Flatten all findings, tagging each with its owning project.
    const allFindings = useMemo(() => {
        const out = [];
        for (const project of PROJECTS || []) {
            for (const finding of project.findings || []) {
                out.push({ ...finding, projectId: project.id, projectName: project.name });
            }
        }
        out.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
        return out;
    }, [PROJECTS]);

    const sourceCounts = useMemo(() => {
        const c = { all: 0, manual: 0, run_review: 0, run_workspace: 0, table_compare: 0, edge_explorer: 0, comparison: 0 };
        for (const f of allFindings) {
            c.all += 1;
            c[classifyFindingSource(f)] += 1;
        }
        return c;
    }, [allFindings]);

    const projectOptions = useMemo(
        () => (PROJECTS || []).map((p) => ({ id: p.id, name: p.name })),
        [PROJECTS],
    );

    const filtered = useMemo(() => {
        return allFindings.filter((f) => {
            const sourceOk = sourceFilter === "all" || classifyFindingSource(f) === sourceFilter;
            const projectOk = projectFilter === "all" || f.projectId === projectFilter;
            return sourceOk && projectOk;
        });
    }, [allFindings, sourceFilter, projectFilter]);

    // INS-3 — group the already-filtered list. `flat` → a single unlabeled group
    // (identical to INS-2). Grouping never re-filters, so counts are unaffected.
    const groups = useMemo(() => {
        if (groupMode === "flat") {
            return [{ key: "__all__", label: null, items: filtered }];
        }
        if (groupMode === "project") {
            const order = [];
            const byKey = new Map();
            for (const f of filtered) {
                const key = f.projectId || "__none__";
                if (!byKey.has(key)) {
                    byKey.set(key, { key, label: f.projectName || "Unassigned", items: [] });
                    order.push(key);
                }
                byKey.get(key).items.push(f);
            }
            return order.map((k) => byKey.get(k));
        }
        // by source — fixed, stable ordering of the three known buckets.
        const byKey = new Map();
        for (const f of filtered) {
            const key = classifyFindingSource(f);
            if (!byKey.has(key)) byKey.set(key, []);
            byKey.get(key).push(f);
        }
        return SOURCE_GROUP_ORDER
            .filter((k) => byKey.has(k))
            .map((k) => ({ key: k, label: SOURCE_GROUP_LABEL[k], items: byKey.get(k) }));
    }, [filtered, groupMode]);

    return (
        <div className="pb-12">
            <LabRunHero
                pageLabel="Insights"
                title="Research Insights"
                description="Every saved finding across all projects — manual notes, Run Workspace captures, and Table Compare results."
                actions={
                    <Link to="/projects">
                        <span className="inline-flex items-center gap-2 px-3 py-1.5 text-[11.5px] font-semibold uppercase tracking-[0.08em] border clip-bevel-sm text-white border-[hsl(var(--accent-secondary))] bg-[hsl(var(--accent-secondary)/0.10)] hover:bg-[hsl(var(--accent-secondary)/0.22)] transition-colors">
                            <FolderKanban className="w-3.5 h-3.5" /> Open Projects
                        </span>
                    </Link>
                }
            />

            <div className="px-6">
                <NeonPanel
                    title="All Findings"
                    action={<Pill tone="primary">{filtered.length} / {allFindings.length}</Pill>}
                >
                    {/* Filters */}
                    <div className="flex flex-col gap-2 mb-3">
                        <div className="flex flex-wrap items-center gap-1.5" data-testid="insights-source-filter">
                            {FINDING_SOURCE_FILTERS.map((filter) => {
                                const active = sourceFilter === filter.value;
                                return (
                                    <button
                                        key={filter.value}
                                        type="button"
                                        data-testid={`insights-source-${filter.value}`}
                                        onClick={() => setSourceFilter(filter.value)}
                                        className={`inline-flex items-center gap-1.5 px-2 py-1 text-[10px] font-ui uppercase tracking-wider clip-bevel-sm border transition-colors ${
                                            active
                                                ? "border-[hsl(var(--accent-secondary))] bg-[hsl(var(--accent-secondary)/0.12)] text-white"
                                                : "border-[hsl(var(--border-mid))] text-[hsl(var(--text-2))] hover:text-white hover:border-[hsl(var(--accent-secondary)/0.5)]"
                                        }`}
                                    >
                                        {filter.label}
                                        <span className={active ? "text-[hsl(var(--accent-secondary))]" : "text-muted-lab"}>{sourceCounts[filter.value]}</span>
                                    </button>
                                );
                            })}
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5" data-testid="insights-project-filter">
                            <button
                                type="button"
                                onClick={() => setProjectFilter("all")}
                                className={`inline-flex items-center gap-1.5 px-2 py-1 text-[10px] font-ui uppercase tracking-wider clip-bevel-sm border transition-colors ${
                                    projectFilter === "all"
                                        ? "border-[hsl(var(--accent-primary))] bg-[hsl(var(--accent-primary)/0.12)] text-white"
                                        : "border-[hsl(var(--border-mid))] text-[hsl(var(--text-2))] hover:text-white hover:border-[hsl(var(--accent-primary)/0.5)]"
                                }`}
                            >
                                All Projects
                            </button>
                            {projectOptions.map((p) => {
                                const active = projectFilter === p.id;
                                return (
                                    <button
                                        key={p.id}
                                        type="button"
                                        onClick={() => setProjectFilter(p.id)}
                                        title={p.name}
                                        className={`inline-flex items-center gap-1.5 px-2 py-1 max-w-[200px] truncate text-[10px] font-ui uppercase tracking-wider clip-bevel-sm border transition-colors ${
                                            active
                                                ? "border-[hsl(var(--accent-primary))] bg-[hsl(var(--accent-primary)/0.12)] text-white"
                                                : "border-[hsl(var(--border-mid))] text-[hsl(var(--text-2))] hover:text-white hover:border-[hsl(var(--accent-primary)/0.5)]"
                                        }`}
                                    >
                                        {p.name}
                                    </button>
                                );
                            })}
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5" data-testid="insights-group-toggle">
                            <span className="text-[9px] font-ui uppercase tracking-[0.18em] text-muted-lab mr-1">Group</span>
                            {GROUP_MODES.map((g) => {
                                const active = groupMode === g.value;
                                return (
                                    <button
                                        key={g.value}
                                        type="button"
                                        data-testid={`insights-group-${g.value}`}
                                        onClick={() => setGroupMode(g.value)}
                                        className={`inline-flex items-center px-2 py-1 text-[10px] font-ui uppercase tracking-wider clip-bevel-sm border transition-colors ${
                                            active
                                                ? "border-[hsl(var(--accent-secondary))] bg-[hsl(var(--accent-secondary)/0.12)] text-white"
                                                : "border-[hsl(var(--border-mid))] text-[hsl(var(--text-2))] hover:text-white hover:border-[hsl(var(--accent-secondary)/0.5)]"
                                        }`}
                                    >
                                        {g.label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* List */}
                    {allFindings.length === 0 ? (
                        <div className="py-12 text-center border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2)/0.24)] clip-bevel-sm">
                            <div className="font-ui text-[10px] uppercase tracking-[0.14em] text-muted-lab">No Insights Yet</div>
                            <div className="mt-2 text-[12px] text-[hsl(var(--text-2))]">
                                No insights saved yet. Save findings from Run Workspace or Table Compare to see them here.
                            </div>
                        </div>
                    ) : filtered.length === 0 ? (
                        <div className="py-10 text-center border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2)/0.24)] clip-bevel-sm">
                            <div className="text-[12px] text-[hsl(var(--text-2))]">No insights for this filter.</div>
                        </div>
                    ) : (
                        <div className="space-y-3 max-h-[640px] overflow-auto scrollbar-thin pr-1">
                            {groups.map((group) => (
                                <div key={group.key} className="space-y-2">
                                    {group.label && (
                                        <div className="flex items-center gap-2 pt-1" data-testid="insights-group-header">
                                            <span className="text-[10px] font-ui uppercase tracking-[0.2em] text-[hsl(var(--accent-secondary))]">{group.label}</span>
                                            <Pill tone="muted">{group.items.length}</Pill>
                                            <span className="flex-1 h-px bg-[hsl(var(--border-soft))]" />
                                        </div>
                                    )}
                                    {group.items.map((finding) => (
                                        <InsightCard
                                            key={`${finding.projectId}-${finding.id || ""}-${finding.createdAt || ""}`}
                                            finding={finding}
                                            runLabel={runLabel}
                                        />
                                    ))}
                                </div>
                            ))}
                        </div>
                    )}
                </NeonPanel>
            </div>
        </div>
    );
}

function InsightCard({ finding, runLabel }) {
    const isTableCompare = finding.source === "table_compare";
    const isEdge = finding.source === "edge_explorer";
    const isComparison = finding.source === "comparison";
    const meta = finding.meta && typeof finding.meta === "object" ? finding.meta : {};
    const tableName = finding.table || meta.table || "";
    const bucketName = finding.bucket || meta.bucket || "";
    const comparedRunId = finding.comparedRunId || meta.comparedRunId || "";
    const comparedLabel = comparedRunId ? runLabel(comparedRunId) : "";
    const universeKey = meta.universeKey || "";
    const basisLabel = meta.basis === "current_equity" ? "Current Equity" : meta.basis === "raw_r" ? "Raw R" : "";
    const sourceRunId = finding.sourceRunId || finding.runId || "";

    return (
        <div className="border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2)/0.28)] clip-bevel-sm px-3 py-3">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                        <Pill tone={finding.type === "sweep_plan" ? "secondary" : finding.type === "question" ? "warning" : "primary"}>
                            {TYPE_LABEL[finding.type] || "Finding"}
                        </Pill>
                        {isTableCompare && <Pill tone="secondary">Table Compare</Pill>}
                        {isEdge && <Pill tone="secondary">Edge Explorer</Pill>}
                        {isComparison && <Pill tone="secondary">Comparison</Pill>}
                        <span className="font-display text-[13px] text-white">{finding.title || (TYPE_LABEL[finding.type] || "Finding")}</span>
                    </div>

                    {finding.note && (
                        <p className="mt-2 text-[12px] leading-relaxed text-[hsl(var(--text-2))] whitespace-pre-wrap break-words">{finding.note}</p>
                    )}

                    {(isTableCompare || isEdge || isComparison) && (tableName || bucketName || comparedLabel || universeKey || basisLabel) && (
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                            {tableName && <Pill tone="muted">{tableName}</Pill>}
                            {bucketName && <Pill tone="muted">Bucket: {bucketName}</Pill>}
                            {comparedLabel && <Pill tone="muted">vs {comparedLabel}</Pill>}
                            {isEdge && universeKey && <Pill tone="muted">{universeKey}</Pill>}
                            {isEdge && basisLabel && <Pill tone="muted">{basisLabel}</Pill>}
                        </div>
                    )}

                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10.5px] font-ui text-muted-lab">
                        {finding.projectId && (
                            <Link
                                to={`/projects/${encodeURIComponent(finding.projectId)}`}
                                className="inline-flex items-center gap-1 text-[hsl(var(--accent-secondary))] hover:text-white"
                                title={finding.projectName}
                            >
                                <FolderKanban className="w-3 h-3" /> {finding.projectName || "Project"}
                            </Link>
                        )}
                        {sourceRunId && (
                            <Link
                                to={`/runs/${encodeURIComponent(sourceRunId)}`}
                                className="inline-flex items-center gap-1 text-[hsl(var(--accent-primary))] hover:text-white"
                                title={runLabel(sourceRunId)}
                            >
                                <Activity className="w-3 h-3" /> {runLabel(sourceRunId)}
                            </Link>
                        )}
                    </div>
                </div>
                <span className="shrink-0 text-[10px] font-code text-muted-lab">{formatDateTime(finding.createdAt)}</span>
            </div>
        </div>
    );
}
