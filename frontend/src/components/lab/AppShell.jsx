import React from "react";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import AppBlueprintBackground from "./AppBlueprintBackground";
import { MasterControlsProvider, useMasterControls } from "@/components/masterControls/MasterControlsContext";
import { MasterControlsDrawer } from "@/components/masterControls/MasterControlsDrawer";
import { GlobalPreviewBanner } from "@/components/masterControls/GlobalPreviewBanner";
import { RunPlaybookProvider } from "@/components/lab/playbook/RunPlaybookProvider";
import { RunAnalysisPlaybookDrawer } from "@/components/lab/playbook/RunAnalysisPlaybookDrawer";
import { TooltipProvider } from "@/components/ui/tooltip";

/**
 * Inner layout — lives INSIDE MasterControlsProvider so it can read the Preview
 * Lens (Phase 8C). It stamps the app root with `data-preview-active` /
 * `data-preview-mode` (a CSS hook for preview-aware surface styling, and a
 * future-proof signal for anything else that needs to know preview is live) and
 * renders the persistent GlobalPreviewBanner just under the TopBar — outside the
 * scrolling <main>, so it stays pinned and persists across every page.
 */
function AppShellLayout({ children }) {
    const { previewLens } = useMasterControls();
    const lensActive = !!previewLens?.active;

    return (
        <div
            className="min-h-screen flex bg-[#050A12] relative"
            data-preview-active={lensActive ? "true" : "false"}
            data-preview-mode={lensActive ? (previewLens.mode || "unknown") : undefined}
        >
            {/* Global blueprint-grid background (base + grid + glow) */}
            <AppBlueprintBackground />
            {/* Subtle noise texture overlay */}
            <div className="pointer-events-none fixed inset-0 noise" />
            <Sidebar />
            <div className="flex-1 min-w-0 flex flex-col relative">
                <TopBar />
                {/* Persistent, non-modal preview indicator — pinned under the top bar. */}
                <GlobalPreviewBanner />
                <main data-testid="app-main" className="flex-1 overflow-x-hidden overflow-y-auto scrollbar-thin">
                    {children}
                </main>
            </div>
            <MasterControlsDrawer />
            {/* Run Analysis Playbook — global, independent of Master Controls. */}
            <RunAnalysisPlaybookDrawer />
        </div>
    );
}

export function AppShell({ children }) {
    return (
        // App-wide TooltipProvider so glossary tooltips (TermTip / ConfidenceChip)
        // resolve on every page without per-panel providers. Panels may still nest
        // their own provider to override delay locally.
        <TooltipProvider delayDuration={150} skipDelayDuration={300}>
            <MasterControlsProvider>
                <RunPlaybookProvider>
                    <AppShellLayout>{children}</AppShellLayout>
                </RunPlaybookProvider>
            </MasterControlsProvider>
        </TooltipProvider>
    );
}

export function PageHeader({ eyebrow, title, subtitle, actions }) {
    return (
        <div className="px-6 pt-6 pb-4">
            <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                    {eyebrow && (
                        <div className="text-[10px] font-ui uppercase tracking-[0.20em] text-[hsl(var(--accent-primary))] mb-2">
                            <span className="inline-block w-6 h-px bg-[hsl(var(--accent-primary))] mr-2 align-middle" />
                            {eyebrow}
                        </div>
                    )}
                    <h1 className="font-display text-[28px] sm:text-[34px] leading-tight font-semibold text-white tracking-tight">
                        {title}
                    </h1>
                    {subtitle && (
                        <p className="text-[13px] text-muted-lab mt-1.5 max-w-2xl">{subtitle}</p>
                    )}
                </div>
                {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
            </div>
        </div>
    );
}
