import React from "react";
import { Link } from "react-router-dom";
import { Info, SlidersHorizontal } from "lucide-react";
import { LabRunHero } from "@/components/lab/LabRunHero";
import { RunConfigStrip } from "@/components/lab/RunConfigStrip";
import { HeroBadge, NeonButton } from "@/components/lab/controls";
import { getRunDisplayName, useDataset } from "@/data/store";
import { variantLabel } from "../analytics/entryFormatters";
import { PairedRunSelector } from "./PairedRunSelector";

// ── Run Config Button ─────────────────────────────────────────────────────────
// Compact button that reveals the full RunConfigStrip in a floating popover.
// Mirrors the implementation in OrderBlockLab.
function RunConfigButton({ run }) {
    const [open, setOpen] = React.useState(false);
    const ref = React.useRef(null);

    React.useEffect(() => {
        if (!open) return;
        const handler = (e) => {
            if (ref.current && !ref.current.contains(e.target)) setOpen(false);
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, [open]);

    if (!run) return null;

    return (
        <div className="relative" ref={ref}>
            <button
                type="button"
                onClick={() => setOpen(p => !p)}
                className={`clip-bevel-sm border px-3 py-1.5 text-[11px] font-ui inline-flex items-center gap-1.5 transition-colors ${
                    open
                        ? "border-[hsl(var(--accent-primary)/0.5)] bg-[hsl(var(--accent-primary)/0.10)] text-[hsl(var(--accent-primary))]"
                        : "border-[hsl(var(--border-soft))] text-[hsl(var(--text-2))] hover:text-white"
                }`}
            >
                <SlidersHorizontal className="w-3 h-3" />
                Run Config
            </button>
            {open && (
                <div className="absolute left-0 top-[calc(100%+6px)] z-50 min-w-[280px] bg-[hsl(var(--panel))] border border-[hsl(var(--border-soft))] shadow-[0_4px_24px_hsl(0,0%,0%,0.35)] clip-bevel-sm p-3">
                    <RunConfigStrip run={run} className="mx-0 mb-0" defaultOpen={true} />
                </div>
            )}
        </div>
    );
}

// ── Scope Panel ───────────────────────────────────────────────────────────────
// Explains the fixed data contract of the Entries Workspace.
// Shown in the right column of the hero so researchers immediately see that
// the base list is pinned to the baseline variant and is not the active universe.
function ScopePanel({ hasExact, modelCount, exactRows }) {
    const [showInfo, setShowInfo] = React.useState(false);

    const modelLabels = React.useMemo(
        () => (exactRows ?? [])
            .filter(r => r.exact && !r.isBaseline)
            .map(r => r.label || r.mode || null)
            .filter(Boolean),
        [exactRows],
    );

    return (
        <div className="clip-bevel-sm border border-[hsl(var(--border-soft)/0.7)] bg-[hsl(var(--panel-2)/0.35)] px-3.5 py-3 flex flex-col gap-2.5 min-w-[240px] max-w-sm">
            {/* Header row */}
            <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-ui uppercase tracking-widest text-muted-lab">
                    Data Scope
                </span>
                <button
                    type="button"
                    onClick={() => setShowInfo(v => !v)}
                    aria-label="What does Data Scope mean?"
                    className={[
                        "flex items-center justify-center w-[18px] h-[18px] rounded-full border transition-colors shrink-0",
                        showInfo
                            ? "border-[hsl(var(--accent-primary)/0.6)] bg-[hsl(var(--accent-primary)/0.12)] text-[hsl(var(--accent-primary))]"
                            : "border-[hsl(var(--border-mid))] text-muted-lab hover:border-[hsl(var(--accent-primary)/0.4)] hover:text-[hsl(var(--text-2))]",
                    ].join(" ")}
                >
                    <Info className="w-2.5 h-2.5" />
                </button>
            </div>

            {/* Data rows */}
            <div className="flex flex-col gap-2 text-[12px] font-ui">
                <div className="flex items-start gap-2.5">
                    <span className="text-[10px] uppercase tracking-wide text-muted-lab shrink-0 mt-0.5">
                        Base list
                    </span>
                    <span>
                        <span className="font-semibold text-[hsl(var(--accent-primary))]">Baseline reference</span>
                        <span className="text-[hsl(var(--text-3))] text-[11px] ml-1.5">· fixed, not active universe</span>
                    </span>
                </div>
                <div className="flex items-start gap-2.5">
                    <span className="text-[10px] uppercase tracking-wide text-muted-lab shrink-0 mt-0.5">
                        Models
                    </span>
                    <div className="flex flex-col gap-1.5 min-w-0">
                        <span className="font-semibold text-[hsl(var(--text-1))]">
                            {hasExact ? `${modelCount} exact model${modelCount !== 1 ? "s" : ""}` : "Baseline only"}
                        </span>
                        {modelLabels.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                                {modelLabels.map(label => (
                                    <span
                                        key={label}
                                        className="text-[10px] px-1.5 py-0.5 rounded-[3px] bg-[hsl(var(--panel))] border border-[hsl(var(--border-soft))] text-[hsl(var(--text-2))] leading-none"
                                    >
                                        {label}
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Expandable info section (click ⓘ to toggle) */}
            {showInfo && (
                <div className="border-t border-[hsl(var(--border-soft)/0.5)] pt-2.5 flex flex-col gap-2 text-[10.5px] font-ui leading-relaxed">
                    <p className="text-[hsl(var(--text-3))]">
                        <span className="text-[hsl(var(--accent-primary))] font-semibold">Baseline reference</span>
                        {" "}— all qualifying order blocks using the run's primary fill logic, with no entry model filter applied. This is the fixed trade universe this page always reads from, regardless of which scenario is active in Strategy Map.
                    </p>
                    <p className="text-[hsl(var(--text-3))]">
                        <span className="text-[hsl(var(--text-2))] font-semibold">Exact models</span>
                        {" "}— entry configurations exported alongside the run, each testing a specific penetration threshold. Columns in the table show per-model fill results next to the baseline row for direct comparison.
                    </p>
                </div>
            )}
        </div>
    );
}

export function EntryWorkspaceHeader({ trades, activeVariant, exactRows }) {
    const { ACTIVE_PROJECT, RUNS, ACTIVE_RUN, activeRunId, getRunData } = useDataset();
    const activeRun     = RUNS.find(r => r.id === activeRunId);
    const activeRunData = getRunData?.(activeRunId) || activeRun;
    const projectName   = ACTIVE_PROJECT?.name || "";
    const runName       = activeRun ? getRunDisplayName(activeRun) : "";
    const hasExact      = exactRows?.some(r => r.exact && !r.isBaseline);
    const modelCount    = exactRows?.filter(r => r.exact && !r.isBaseline).length ?? 0;

    // Show the paired-run selector only when there is more than one loaded run.
    // PairedRunSelector is self-contained and renders nothing when options === 0,
    // but gate it here too to avoid a visible empty strip.
    const showPairedSelector = activeRunId && RUNS.length > 1;

    return (
        <>
            <LabRunHero
                pageLabel="Entries Research Workspace"
                title={projectName || runName || "No run selected"}
                runLine={[
                    runName && projectName ? `Run: ${runName}` : null,
                    trades.length ? `${trades.length} trades` : null,
                    variantLabel(activeVariant),
                ].filter(Boolean).join(" · ")}
                description={<ScopePanel hasExact={hasExact} modelCount={modelCount} exactRows={exactRows} />}
                className="mt-4 mb-0"
                showOpenProject={false}
                showDefaultStatusBadges={false}
                actions={(
                    <>
                        <RunConfigButton run={activeRunData} />
                        {!activeRunId && (
                            <Link to="/runs">
                                <NeonButton tone="ghost">Select a Run →</NeonButton>
                            </Link>
                        )}
                        {activeRunId && (
                            <Link to={`/runs/${encodeURIComponent(activeRunId)}`}>
                                <NeonButton tone="ghost">Run Workspace</NeonButton>
                            </Link>
                        )}
                        <HeroBadge tone={hasExact ? "success" : "warning"}>
                            {hasExact ? `${modelCount} Models` : "Baseline Only"}
                        </HeroBadge>
                    </>
                )}
            />

            {/* Paired FFT-OFF run selector — appears below the hero when
                multiple runs are loaded. Self-contained; reads/writes store. */}
            {showPairedSelector && (
                <div className="mt-2 flex justify-end px-6">
                    <PairedRunSelector />
                </div>
            )}
        </>
    );
}
