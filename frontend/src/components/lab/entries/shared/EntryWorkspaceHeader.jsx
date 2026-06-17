import React from "react";
import { Link } from "react-router-dom";
import { SlidersHorizontal } from "lucide-react";
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

export function EntryWorkspaceHeader({ trades, activeVariant, exactRows }) {
    const { ACTIVE_PROJECT, RUNS, ACTIVE_RUN, activeRunId, getRunData } = useDataset();
    const activeRun     = RUNS.find(r => r.id === activeRunId);
    const activeRunData = getRunData?.(activeRunId) || activeRun;
    const projectName   = ACTIVE_PROJECT?.name || "";
    const runName       = activeRun ? getRunDisplayName(activeRun) : "";
    const hasExact      = exactRows?.some(r => r.exact && !r.isBaseline);
    const modelCount    = exactRows?.filter(r => r.exact && !r.isBaseline).length ?? 0;

    // Show the paired-run selector whenever an active run exists.
    // When no other runs are loaded, PairedRunSelector renders a disabled
    // "No pairable runs loaded" state so the control is discoverable.
    const showPairedSelector = Boolean(activeRunId);

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
