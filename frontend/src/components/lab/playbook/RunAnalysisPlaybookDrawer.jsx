/**
 * RunAnalysisPlaybookDrawer — the Run Analysis Playbook side panel
 * (RUN-ANALYSIS-PLAYBOOK Phase 2A).
 *
 * Mounted globally from AppShell. Two presentation modes (toggled in the header,
 * persisted via the provider):
 *   • DOCKED (default) — NON-MODAL: a fixed right-side panel with NO overlay, so
 *     the page stays fully interactive. AppShell shifts the main content to make
 *     room (on xl). Use the page and the checklist side by side.
 *   • OVERLAY — modal ui/sheet (focus mode, dims the page).
 *
 * Run context from the store (activeRunId + buildBannerRunIdentity); per-run
 * checklist state via usePlaybook(activeRunId) → persists, survives nav / close /
 * refresh / run-switch. Shortcut links navigate WITHOUT closing the panel.
 *
 * Scope (Phase 2A): no insight saving, no Insights integration, no analytics.
 */

import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, ChevronDown, ChevronRight, ArrowUpRight, RotateCcw, PanelRight, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { useDataset } from "@/data/store";
import { buildBannerRunIdentity } from "@/components/lab/researchBanner/bannerRun";
import { usePlaybook } from "@/data/usePlaybook";
import { useRunPlaybook } from "./RunPlaybookProvider";

const PANEL_WIDTH = 440;

// ── Step checkbox row ─────────────────────────────────────────────────────────
function StepRow({ step, checked, onToggle, onNavigate }) {
    return (
        <div className="flex items-start gap-2.5 py-1.5">
            <button
                type="button"
                role="checkbox"
                aria-checked={checked}
                onClick={onToggle}
                className={cn(
                    "mt-px shrink-0 w-4 h-4 rounded-[3px] border flex items-center justify-center transition-colors",
                    checked
                        ? "border-[hsl(var(--accent-primary)/0.7)] bg-[hsl(var(--accent-primary)/0.18)] text-[hsl(var(--accent-primary))]"
                        : "border-[hsl(var(--border-soft))] hover:border-[hsl(var(--accent-primary)/0.5)]",
                )}
            >
                {checked && <Check className="w-3 h-3" />}
            </button>
            <div className="flex-1 min-w-0 flex flex-wrap items-center gap-x-2 gap-y-1">
                <span
                    onClick={onToggle}
                    className={cn(
                        "text-[12px] font-ui leading-snug cursor-pointer",
                        checked ? "text-[hsl(var(--text-2)/0.7)] line-through" : "text-[hsl(var(--text-1))]",
                    )}
                >
                    {step.label}
                </span>
                {step.shortcut && (
                    <button
                        type="button"
                        onClick={onNavigate}
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-ui border border-[hsl(var(--border-soft))] clip-bevel-sm text-[hsl(var(--text-2))] hover:border-[hsl(var(--accent-primary)/0.5)] hover:text-[hsl(var(--accent-primary))] transition-colors whitespace-nowrap"
                    >
                        {step.shortcut.label}
                        <ArrowUpRight className="w-2.5 h-2.5" />
                    </button>
                )}
            </div>
        </div>
    );
}

// ── Decision radio group ──────────────────────────────────────────────────────
function DecisionGroup({ decisions, value, onSelect }) {
    return (
        <div className="flex flex-col gap-1 pt-1">
            {decisions.map((d) => {
                const active = value === d.id;
                return (
                    <button
                        key={d.id}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        onClick={() => onSelect(active ? null : d.id)}
                        className={cn(
                            "flex items-center gap-2.5 px-2 py-1.5 rounded-[4px] border text-left transition-colors",
                            active
                                ? "border-[hsl(var(--accent-primary)/0.6)] bg-[hsl(var(--accent-primary)/0.08)]"
                                : "border-transparent hover:bg-[hsl(var(--panel-2)/0.4)]",
                        )}
                    >
                        <span className={cn(
                            "shrink-0 w-3.5 h-3.5 rounded-full border flex items-center justify-center",
                            active ? "border-[hsl(var(--accent-primary))]" : "border-[hsl(var(--border-soft))]",
                        )}>
                            {active && <span className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--accent-primary))]" />}
                        </span>
                        <span className={cn("text-[12px] font-ui", active ? "text-[hsl(var(--text-1))]" : "text-[hsl(var(--text-2))]")}>
                            {d.label}
                        </span>
                    </button>
                );
            })}
        </div>
    );
}

export function RunAnalysisPlaybookDrawer() {
    const { isOpen, setOpen, close, docked, toggleDock } = useRunPlaybook();
    const { ACTIVE_RUN, activeRunId, getRunData } = useDataset();
    const navigate = useNavigate();
    const [confirmReset, setConfirmReset] = useState(false);

    const runBundle = activeRunId && getRunData ? getRunData(activeRunId) : null;
    const runIdentity = useMemo(
        () => buildBannerRunIdentity(runBundle || ACTIVE_RUN),
        [runBundle, ACTIVE_RUN],
    );

    const {
        sections, decisions, decision, progress,
        toggleStep, setDecision, setSectionCollapsed, resetRun,
        isChecked, isCollapsed,
    } = usePlaybook(activeRunId);

    const sectionStats = useMemo(() => sections.map((sec) => {
        const steps = sec.steps || [];
        const done = steps.filter((st) => isChecked(st.id)).length;
        return { id: sec.id, total: steps.length, done, complete: steps.length > 0 && done === steps.length };
    }), [sections, isChecked]);

    const currentIndex = useMemo(() => {
        const idx = sectionStats.findIndex((s) => s.total > 0 && s.done < s.total);
        return idx === -1 ? sections.length - 1 : idx;
    }, [sectionStats, sections.length]);

    const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;
    const currentSection = sections[currentIndex] || sections[0];
    const currentStat = sectionStats[currentIndex] || { total: 0, done: 0 };
    const remaining = Math.max(0, currentStat.total - currentStat.done);

    const handleShortcut = (to) => { if (to) navigate(to); /* keep panel open */ };

    // ── Header controls (dock toggle + close) ─────────────────────────────────
    const headerControls = (
        <div className={cn("flex items-center gap-1", !docked && "mr-7")}>
            <button
                type="button"
                onClick={toggleDock}
                title={docked ? "Docked — click for overlay (focus) mode" : "Overlay — click to dock alongside the page"}
                className={cn(
                    "p-1 rounded-[4px] border transition-colors",
                    docked
                        ? "border-[hsl(var(--accent-primary)/0.5)] text-[hsl(var(--accent-primary))] bg-[hsl(var(--accent-primary)/0.08)]"
                        : "border-[hsl(var(--border-soft))] text-[hsl(var(--text-2))] hover:text-white",
                )}
            >
                <PanelRight className="w-3.5 h-3.5" />
            </button>
            {docked && (
                <button
                    type="button"
                    onClick={close}
                    title="Close"
                    className="p-1 rounded-[4px] border border-[hsl(var(--border-soft))] text-[hsl(var(--text-2))] hover:text-white transition-colors"
                >
                    <X className="w-3.5 h-3.5" />
                </button>
            )}
        </div>
    );

    // ── Shared body (identical in docked + overlay) ───────────────────────────
    const body = (
        <>
            {/* Header */}
            <div className="px-5 pt-5 pb-3 border-b border-[hsl(var(--border-soft)/0.6)]">
                <div className="flex items-start justify-between gap-2">
                    <span className="text-[10px] font-ui uppercase tracking-[0.16em] text-[hsl(var(--accent-primary))] font-semibold">
                        Run Analysis Playbook
                    </span>
                    {headerControls}
                </div>
                {activeRunId && runIdentity ? (
                    <div className="mt-1.5">
                        <div className="text-[16px] font-ui font-semibold text-[hsl(var(--text-1))] truncate leading-tight">
                            {runIdentity.name || runIdentity.id || "Run"}
                        </div>
                        {(runIdentity.symbol || runIdentity.timeframe || runIdentity.dateRange) && (
                            <div className="text-[11.5px] font-ui text-[hsl(var(--text-2))] mt-0.5">
                                {[runIdentity.symbol, runIdentity.timeframe, runIdentity.dateRange, runIdentity.monthsSpan].filter(Boolean).join(" · ")}
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="mt-2 text-[12px] font-ui text-[hsl(var(--text-2))]">
                        Open or import a run to start a review.
                    </div>
                )}
            </div>

            {activeRunId && (
                <>
                    {/* Current Stage card */}
                    <div className="mx-5 mt-4 mb-1 clip-bevel-sm border border-[hsl(var(--accent-primary)/0.4)] bg-[hsl(var(--accent-primary)/0.05)] px-4 py-3">
                        <div className="flex items-baseline justify-between gap-2">
                            <span className="text-[9px] font-ui uppercase tracking-[0.14em] text-[hsl(var(--accent-primary))]">Current Stage</span>
                            <span className="text-[10px] font-ui text-[hsl(var(--text-2)/0.8)]">Stage {currentIndex + 1} of {sections.length}</span>
                        </div>
                        <div className="mt-1 text-[15px] font-ui font-semibold text-[hsl(var(--text-1))] leading-tight">
                            {currentSection?.title}
                        </div>
                        <div className="mt-0.5 text-[11px] font-ui text-[hsl(var(--text-2))]">
                            {currentSection?.isDecision
                                ? (decision ? "Outcome chosen" : "Choose an outcome")
                                : remaining === 0 ? "Section complete" : `${remaining} item${remaining === 1 ? "" : "s"} left in this section`}
                        </div>
                        <div className="mt-2.5 flex items-center gap-2">
                            <div className="flex-1 h-1.5 rounded-full bg-[hsl(var(--panel-2))] overflow-hidden">
                                <div className="h-full rounded-full bg-[hsl(var(--accent-primary))]" style={{ width: `${pct}%` }} />
                            </div>
                            <span className="text-[10.5px] font-num tabular-nums text-[hsl(var(--text-2))]">
                                {pct}% · {progress.done}/{progress.total}
                            </span>
                        </div>
                    </div>

                    {/* Sections (scrollable) */}
                    <div className="flex-1 overflow-y-auto scrollbar-thin px-5 py-3 flex flex-col gap-1">
                        {sections.map((sec, i) => {
                            const collapsed = isCollapsed(sec.id);
                            const stat = sectionStats[i];
                            return (
                                <div key={sec.id} className="border-b border-[hsl(var(--border-soft)/0.25)] pb-1.5">
                                    <button
                                        type="button"
                                        onClick={() => setSectionCollapsed(sec.id, !collapsed)}
                                        className="w-full flex items-center gap-2 py-2 text-left"
                                    >
                                        {collapsed ? <ChevronRight className="w-3.5 h-3.5 text-[hsl(var(--text-2))] shrink-0" /> : <ChevronDown className="w-3.5 h-3.5 text-[hsl(var(--text-2))] shrink-0" />}
                                        <span className={cn(
                                            "flex-1 text-[12px] font-ui font-semibold uppercase tracking-[0.04em]",
                                            i === currentIndex ? "text-[hsl(var(--accent-primary))]" : "text-[hsl(var(--text-1))]",
                                        )}>
                                            {sec.title}
                                        </span>
                                        {!sec.isDecision && (
                                            <span className={cn(
                                                "text-[10px] font-num tabular-nums",
                                                stat.complete ? "text-[hsl(var(--success))]" : "text-[hsl(var(--text-2)/0.7)]",
                                            )}>
                                                {stat.done}/{stat.total}
                                            </span>
                                        )}
                                    </button>
                                    {!collapsed && (
                                        <div className="pl-1.5 pb-1">
                                            {sec.isDecision ? (
                                                <DecisionGroup decisions={decisions} value={decision} onSelect={setDecision} />
                                            ) : (
                                                (sec.steps || []).map((step) => (
                                                    <StepRow
                                                        key={step.id}
                                                        step={step}
                                                        checked={isChecked(step.id)}
                                                        onToggle={() => toggleStep(step.id)}
                                                        onNavigate={() => handleShortcut(step.shortcut?.to)}
                                                    />
                                                ))
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    {/* Footer */}
                    <div className="px-5 py-3 border-t border-[hsl(var(--border-soft)/0.6)] flex items-center justify-between gap-2">
                        {confirmReset ? (
                            <div className="flex items-center gap-2">
                                <span className="text-[11px] font-ui text-[hsl(var(--warning))]">Reset this run's checklist?</span>
                                <button
                                    type="button"
                                    onClick={() => { resetRun(); setConfirmReset(false); }}
                                    className="px-2 py-1 text-[10px] font-ui uppercase tracking-wider border border-[hsl(var(--warning)/0.6)] text-[hsl(var(--warning))] bg-[hsl(var(--warning)/0.1)] clip-bevel-sm hover:bg-[hsl(var(--warning)/0.18)]"
                                >
                                    Confirm
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setConfirmReset(false)}
                                    className="px-2 py-1 text-[10px] font-ui uppercase tracking-wider border border-[hsl(var(--border-soft))] text-muted-lab clip-bevel-sm hover:text-white"
                                >
                                    Cancel
                                </button>
                            </div>
                        ) : (
                            <button
                                type="button"
                                onClick={() => setConfirmReset(true)}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-ui uppercase tracking-wider border border-[hsl(var(--border-soft))] text-muted-lab clip-bevel-sm hover:border-[hsl(var(--border-mid))] hover:text-white transition-colors"
                            >
                                <RotateCcw className="w-3 h-3" />
                                Reset Playbook
                            </button>
                        )}
                        <span className="text-[9.5px] font-ui text-[hsl(var(--text-2)/0.5)]">Add Insight · Phase 2B</span>
                    </div>
                </>
            )}
        </>
    );

    // ── DOCKED (non-modal) — fixed panel, no overlay, page interactive ────────
    if (docked) {
        return (
            <aside
                aria-label="Run Analysis Playbook"
                aria-hidden={!isOpen}
                className={cn(
                    "fixed top-0 right-0 z-40 h-screen flex flex-col bg-[hsl(var(--bg-2))] border-l border-[hsl(var(--border-soft))] shadow-2xl transition-transform duration-300 ease-in-out",
                    isOpen ? "translate-x-0" : "translate-x-full pointer-events-none",
                )}
                style={{ width: PANEL_WIDTH, maxWidth: "94vw" }}
            >
                {body}
            </aside>
        );
    }

    // ── OVERLAY (modal) — focus mode via ui/sheet ─────────────────────────────
    return (
        <Sheet open={isOpen} onOpenChange={setOpen}>
            <SheetContent
                side="right"
                className="p-0 flex flex-col gap-0 bg-[hsl(var(--bg-2))] border-l border-[hsl(var(--border-soft))]"
                style={{ width: PANEL_WIDTH, maxWidth: "94vw" }}
            >
                <SheetTitle className="sr-only">Run Analysis Playbook</SheetTitle>
                {body}
            </SheetContent>
        </Sheet>
    );
}

export default RunAnalysisPlaybookDrawer;
