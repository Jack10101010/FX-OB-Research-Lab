// ── projectWorkflow.js ───────────────────────────────────────────────────────
// Shared project research-workflow helpers.
//
// `getNextStep` was originally defined locally inside pages/ProjectDetail.jsx.
// It is a pure function of (project, checklist) and is now shared so the same
// guidance can be surfaced on the Run Workspace (RunDetail) without duplicating
// the logic. Behaviour is intentionally identical to the original.
//
// Returned shape:
//   { title, copy, action, to?, sweepType?, activateProject? }
//   - `to`            → a route to navigate to (Link target)
//   - `sweepType`     → present when the step opens a sweep plan (ProjectDetail
//                       only; other surfaces should fall back to the project page)
//   - `activateProject` → set the project active before navigating

import { computeProfitFactor } from "@/lib/metrics";

export function getNextStep(project, checklist) {
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

// ── WF-3: "What changed?" delta helpers ──────────────────────────────────────
// All pure. They read existing run summary fields only (netR, winRate, trades,
// maxDd) and compute Profit Factor opportunistically from trades when those are
// already loaded. Nothing here recomputes heavy analytics or invents data.

const REFERENCE_LABELS = {
    baseline: "vs Baseline",
    previous_project: "vs Previous Project Run",
    previous_imported: "vs Previous Imported Run",
    none: "No reference run yet",
};

export function referenceReasonLabel(reason) {
    return REFERENCE_LABELS[reason] || REFERENCE_LABELS.none;
}

// Choose the safest comparison target for `currentRun`.
// Priority: project baseline → previous run in same project → previous imported
// run (global) → none. `runs` is the derived RUNS list (newest-first).
export function resolveRunReference({ currentRun, project, runs }) {
    if (!currentRun) return { run: null, reason: "none" };
    const ordered = Array.isArray(runs) ? runs.filter(Boolean) : [];
    const others = ordered.filter((r) => r.id !== currentRun.id);

    // 1. Project baseline (only when the current run is not itself the baseline).
    if (project?.baselineRunId && project.baselineRunId !== currentRun.id) {
        const baseline = others.find((r) => r.id === project.baselineRunId);
        if (baseline) return { run: baseline, reason: "baseline" };
    }

    // Newest run that was imported before currentRun, from a given pool.
    const previousFrom = (pool) => {
        const cur = currentRun.importedAt || "";
        const dated = pool.filter((r) => r.importedAt && cur && String(r.importedAt) < String(cur));
        if (dated.length) {
            return dated.sort((a, b) => String(b.importedAt).localeCompare(String(a.importedAt)))[0];
        }
        // Positional fallback when timestamps are missing: ordered is newest-first,
        // so the first pool member appearing after currentRun is the previous one.
        const idx = ordered.findIndex((r) => r.id === currentRun.id);
        if (idx >= 0) {
            for (let i = idx + 1; i < ordered.length; i += 1) {
                if (pool.some((p) => p.id === ordered[i].id)) return ordered[i];
            }
        }
        return null;
    };

    // 2. Previous run within the same project.
    if (project?.id) {
        const inProject = others.filter(
            (r) => r.projectId === project.id || (project.runIds || []).includes(r.id),
        );
        const prev = previousFrom(inProject);
        if (prev) return { run: prev, reason: "previous_project" };
    }

    // 3. Previous imported run (global).
    const prevGlobal = previousFrom(others);
    if (prevGlobal) return { run: prevGlobal, reason: "previous_imported" };

    return { run: null, reason: "none" };
}

// Reduce a run row (+ optional loaded trades) to the headline metrics we diff.
export function summarizeRunForDelta(run, trades = null) {
    if (!run) return null;
    const num = (value) => {
        const n = Number(value);
        return Number.isFinite(n) ? n : null;
    };
    return {
        id: run.id,
        displayName: run.displayName || run.name || run.id,
        netR: num(run.netR),
        winRate: num(run.winRate),
        trades: num(run.trades ?? run.tradeCount ?? run.trade_count),
        maxDd: num(run.maxDd ?? run.maxDrawdown),
        profitFactor: Array.isArray(trades) && trades.length ? computeProfitFactor(trades) : null,
    };
}

// Metric definitions for the strip. `higherIsBetter: null` → always neutral.
// Max DD values are ≤ 0 R, so a higher (less negative) value is the improvement.
const DELTA_METRICS = [
    { key: "netR",         label: "Net R",  unit: "R", digits: 1, higherIsBetter: true },
    { key: "winRate",      label: "WR",     unit: "%", digits: 1, higherIsBetter: true },
    { key: "trades",       label: "Trades", unit: "",  digits: 0, higherIsBetter: null },
    { key: "profitFactor", label: "PF",     unit: "",  digits: 2, higherIsBetter: true },
    { key: "maxDd",        label: "Max DD", unit: "R", digits: 1, higherIsBetter: true },
];

// ── Findings source classification (WF-9 / INS-2) ────────────────────────────
// Shared so ProjectDetail's per-project filter and the global Insights page use
// identical rules. Old findings (no `source`) and any unrecognized source fall
// under "manual".
export function classifyFindingSource(finding) {
    if (finding?.source === "table_compare") return "table_compare";
    if (finding?.source === "edge_explorer") return "edge_explorer";
    if (finding?.source === "comparison") return "comparison";
    if (finding?.source === "run_workspace") return "run_workspace";
    return "manual";
}

export const FINDING_SOURCE_FILTERS = [
    { value: "all", label: "All" },
    { value: "manual", label: "Manual" },
    { value: "run_workspace", label: "Run Workspace" },
    { value: "table_compare", label: "Table Compare" },
    { value: "edge_explorer", label: "Edge Explorer" },
    { value: "comparison", label: "Comparison" },
];

// ── Shared finding-payload builder (EDGE-3) ──────────────────────────────────
// Both Table Compare (WF-7) and Edge Explorer (EDGE-2) capture findings with the
// same metadata contract. This pure builder assembles the object passed to
// store.addProjectFinding so the shape stays consistent across sources (top-level
// table/bucket/comparedRunId for existing renderers, plus a normalized `meta`).
// It does NOT call the store and adds no fields the store doesn't already accept.
export function buildResearchFindingPayload({
    source,
    type = "finding",
    title,
    note,
    tag,
    runId,
    sourceRunId,
    table,
    bucket,
    comparedRunId,
    universeKey,
    basis,
    account,
    metaExtra = {},
} = {}) {
    const meta = {
        ...(table != null && table !== "" ? { table } : {}),
        ...(bucket != null && bucket !== "" ? { bucket } : {}),
        ...(comparedRunId ? { comparedRunId } : {}),
        ...(universeKey != null && universeKey !== "" ? { universeKey } : {}),
        ...(basis != null && basis !== "" ? { basis } : {}),
        ...(account != null ? { account } : {}),
        ...(metaExtra && typeof metaExtra === "object" ? metaExtra : {}),
    };
    return {
        type,
        title,
        note,
        source,
        ...(tag ? { tag } : {}),
        runId: runId || sourceRunId || "",
        sourceRunId: sourceRunId || runId || "",
        ...(table ? { table } : {}),
        ...(bucket ? { bucket } : {}),
        ...(comparedRunId ? { comparedRunId } : {}),
        meta,
    };
}

// Build per-metric deltas. Missing values → direction "na" (rendered calmly).
export function buildRunDelta(current, reference) {
    if (!current || !reference) return [];
    return DELTA_METRICS.map((m) => {
        const cur = current[m.key];
        const ref = reference[m.key];
        if (cur == null || ref == null) {
            return { ...m, current: cur, reference: ref, delta: null, direction: "na" };
        }
        const delta = cur - ref;
        let direction = "neutral";
        if (m.higherIsBetter !== null && delta !== 0) {
            const improved = delta > 0 ? m.higherIsBetter : !m.higherIsBetter;
            direction = improved ? "up" : "down";
        }
        return { ...m, current: cur, reference: ref, delta, direction };
    });
}
