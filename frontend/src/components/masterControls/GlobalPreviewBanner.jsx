import React from "react";
import { useMasterControls } from "./MasterControlsContext";

/**
 * GlobalPreviewBanner — Phase 8C.
 *
 * A persistent, non-modal "research preview mode" bar shown whenever a Preview
 * Lens is active (`previewLens.active === true`). Because the lens can now make
 * any page in the app display temporary cost-rescored data (Phase 8A/8B/9A), the
 * user must always be able to tell — from anywhere — that the numbers on screen
 * are not saved. This bar makes that unmissable and offers the two safe exits.
 *
 * Reuses existing wiring ONLY — `exitPreviewLens()` and `openMasterControls()`
 * from the Master Controls context. No store / lens / rescore logic lives here.
 *
 * Tone is deliberately "research preview", not "danger": a soft amber bar with a
 * calm pulsing dot, never error-red or flashing. The action layout reserves room
 * on the right for a future "Save As Run" affordance.
 */
export function GlobalPreviewBanner() {
    const { previewLens, exitPreviewLens, openMasterControls } = useMasterControls();

    if (!previewLens?.active) return null;

    const label = previewLens.label || "Preview";

    return (
        <div
            data-testid="global-preview-banner"
            className="flex items-center gap-3 px-6 py-1.5 border-b border-[hsl(var(--warning)/0.45)]
                       bg-[hsl(var(--warning)/0.08)] backdrop-blur-sm"
        >
            {/* Amber status dot (the 🟠 indicator) — calm pulse, never flashing. */}
            <span className="relative flex h-2 w-2 shrink-0">
                <span className="absolute inline-flex h-full w-full rounded-full bg-[hsl(var(--warning))] opacity-50 animate-ping" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-[hsl(var(--warning))]" />
            </span>

            <span className="font-ui text-[10px] font-semibold uppercase tracking-[0.14em] text-[hsl(var(--warning))] whitespace-nowrap">
                Temporary preview active
            </span>

            <span className="font-ui text-[11px] text-[hsl(var(--text-1))] truncate min-w-0">
                {label}
            </span>

            <span className="font-ui text-[9.5px] uppercase tracking-wider text-[hsl(var(--text-muted))] whitespace-nowrap">
                Not saved
            </span>

            {/* Right-aligned actions. Layout leaves room for a future Save As Run. */}
            <div className="ml-auto flex items-center gap-1.5 shrink-0">
                <button
                    type="button"
                    onClick={openMasterControls}
                    className="font-ui text-[10px] px-2 py-1 clip-bevel-sm border border-[hsl(var(--border-soft))]
                               text-[hsl(var(--text-1))] hover:text-[hsl(var(--text))]
                               hover:border-[hsl(var(--warning)/0.6)] transition-colors"
                >
                    Open Controls
                </button>
                <button
                    type="button"
                    onClick={exitPreviewLens}
                    className="font-ui text-[10px] font-semibold px-2 py-1 clip-bevel-sm
                               border border-[hsl(var(--warning)/0.6)] text-[hsl(var(--warning))]
                               bg-[hsl(var(--warning)/0.12)] hover:bg-[hsl(var(--warning)/0.2)]
                               transition-colors"
                >
                    Exit Preview
                </button>
            </div>
        </div>
    );
}

export default GlobalPreviewBanner;
