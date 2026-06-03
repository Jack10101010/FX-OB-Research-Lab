/**
 * OBLabTabShell — tab navigation shell for the Order Block Lab page.
 *
 * Architecture:
 *   • A persistent header region (LabRunHero, RunConfigStrip, TradeUniverseBadge)
 *     is rendered above the sticky tab bar and is NEVER hidden.
 *   • A FilterBar is rendered directly below the tab bar, always visible, and
 *     applies to all tab content areas.
 *   • Five workflow tab areas (Model Analysis, Edge Discovery, Failure Lab,
 *     Robustness, Promotion Desk) are all kept MOUNTED at all times. Only
 *     visibility is toggled (display:none / block) so internal component state
 *     (collapsed panels, sort state, Segment selections) survives tab switches.
 *   • Active tab is persisted to localStorage under `oblab-active-tab-v1`.
 *
 * Visual language:
 *   Matches the WorkspaceTabBar style from the Entries Research Workspace —
 *   sticky underline tabs with accent-primary glow on active, short labels on
 *   mobile. Pattern is replicated here (not imported) to keep OBLabTabShell
 *   self-contained and avoid cross-workspace component coupling.
 *
 * Props
 *   header          {ReactNode}   LabRunHero + RunConfigStrip + TradeUniverseBadge.
 *   filterBar       {ReactNode}   FilterBar rendered below the sticky tab bar.
 *   tabs            {Array<{ key, label, short, content }>}
 *   activeTab       {string}      Controlled active tab key.
 *   onTabChange     {(key) => void}
 *   hasActiveFilters {boolean}    Shows "Filtered" badge in the tab bar.
 */

import React from "react";
import { cn } from "@/lib/utils";

// ─── Tab bar ──────────────────────────────────────────────────────────────────
// Matches the WorkspaceTabBar style from Entries Research Workspace:
// sticky, underline active indicator with accent glow, short labels on mobile.

function OBLabWorkspaceTabBar({ tabs, activeTab, onTabChange, hasActiveFilters }) {
    return (
        <div className="sticky top-0 z-20 bg-[hsl(var(--bg)/0.95)] backdrop-blur-xl border-b border-[hsl(var(--border-soft))] px-6">
            <div className="flex items-end gap-0 overflow-x-auto scrollbar-none">
                {tabs.map((tab) => {
                    const isActive = activeTab === tab.key;
                    return (
                        <button
                            key={tab.key}
                            type="button"
                            onClick={() => onTabChange(tab.key)}
                            className={cn(
                                "relative flex items-center gap-1.5 px-4 py-3 text-[11.5px] font-ui uppercase tracking-[0.16em] whitespace-nowrap transition-all duration-150 border-b-2 select-none",
                                isActive
                                    ? "text-white border-[hsl(var(--accent-primary))] bg-[hsl(var(--accent-primary)/0.06)]"
                                    : "text-[hsl(var(--text-2))] border-transparent hover:text-white hover:border-[hsl(var(--border-mid))] hover:bg-[hsl(var(--panel-2)/0.4)]",
                            )}
                            aria-selected={isActive}
                            role="tab"
                        >
                            {isActive && (
                                <span
                                    className="absolute inset-x-0 top-0 h-px"
                                    style={{ background: "linear-gradient(90deg, transparent, hsl(var(--accent-primary)/0.6), transparent)" }}
                                />
                            )}
                            <span className="hidden sm:inline">{tab.label}</span>
                            <span className="sm:hidden">{tab.short || tab.label}</span>
                            {isActive && (
                                <span
                                    className="absolute bottom-0 left-0 right-0 h-[2px] bg-[hsl(var(--accent-primary))]"
                                    style={{ boxShadow: "0 0 8px hsl(var(--accent-primary))" }}
                                />
                            )}
                        </button>
                    );
                })}
                {hasActiveFilters && (
                    <span className="ml-auto self-center mb-1 flex items-center gap-1 px-2 py-0.5 clip-bevel-sm border border-[hsl(var(--warning)/0.5)] bg-[hsl(var(--warning)/0.08)] text-[9.5px] font-ui uppercase tracking-wider text-[hsl(var(--warning))]">
                        <span className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--warning))] animate-pulse" />
                        Filtered
                    </span>
                )}
            </div>
        </div>
    );
}

// ─── Shell ────────────────────────────────────────────────────────────────────

export function OBLabTabShell({
    header,
    filterBar,
    tabs,
    activeTab,
    onTabChange,
    hasActiveFilters = false,
}) {
    return (
        <div>
            {/* Persistent header — LabRunHero, RunConfigStrip, TradeUniverseBadge */}
            {header}

            {/* Sticky tab bar — Entries Workspace underline style */}
            <OBLabWorkspaceTabBar
                tabs={tabs}
                activeTab={activeTab}
                onTabChange={onTabChange}
                hasActiveFilters={hasActiveFilters}
            />

            {/* FilterBar — always visible, sits between tab bar and tab content */}
            {filterBar}

            {/* Tab content areas — all kept mounted, visibility toggled via
                display:none so internal state (collapsed panels, sort order,
                Segment selections) survives tab switches without unmounting */}
            {tabs.map((tab) => (
                <div
                    key={tab.key}
                    role="tabpanel"
                    aria-hidden={tab.key !== activeTab}
                    style={{ display: tab.key === activeTab ? "block" : "none" }}
                >
                    {tab.content}
                </div>
            ))}
        </div>
    );
}

export default OBLabTabShell;
