import React from "react";
import { cn } from "@/lib/utils";
import { TABS } from "./useEntryWorkspace";

// Premium workspace tab bar — consistent with the FX-OB Research Lab design language.

export function WorkspaceTabBar({ activeTab, onTabChange, hasActiveFilters, tabs }) {
    const tabList = tabs || TABS;
    return (
        <div className="sticky top-0 z-20 bg-[hsl(var(--bg)/0.95)] backdrop-blur-xl border-b border-[hsl(var(--border-soft))] px-6">
            <div className="flex items-end gap-0 overflow-x-auto scrollbar-none">
                {tabList.map((tab) => {
                    const isActive = activeTab === tab.key;
                    return (
                        <button
                            key={tab.key}
                            type="button"
                            onClick={() => onTabChange(tab.key)}
                            className={cn(
                                "relative flex items-center gap-1.5 px-4 py-3 text-[11.5px] font-mono uppercase tracking-[0.16em] whitespace-nowrap transition-all duration-150 border-b-2 select-none",
                                isActive
                                    ? "text-white border-[hsl(var(--accent-primary))] bg-[hsl(var(--accent-primary)/0.06)]"
                                    : "text-[hsl(var(--text-2))] border-transparent hover:text-white hover:border-[hsl(var(--border-mid))] hover:bg-[hsl(var(--panel-2)/0.4)]",
                            )}
                        >
                            {isActive && (
                                <span
                                    className="absolute inset-x-0 top-0 h-px"
                                    style={{ background: "linear-gradient(90deg, transparent, hsl(var(--accent-primary)/0.6), transparent)" }}
                                />
                            )}
                            <span className="hidden sm:inline">{tab.label}</span>
                            <span className="sm:hidden">{tab.short}</span>
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
                    <span className="ml-auto self-center mb-1 flex items-center gap-1 px-2 py-0.5 clip-bevel-sm border border-[hsl(var(--warning)/0.5)] bg-[hsl(var(--warning)/0.08)] text-[9.5px] font-mono uppercase tracking-wider text-[hsl(var(--warning))]">
                        <span className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--warning))] animate-pulse" />
                        Filtered
                    </span>
                )}
            </div>
        </div>
    );
}
