import React from "react";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import AppBlueprintBackground from "./AppBlueprintBackground";

export function AppShell({ children }) {
    return (
        <div className="min-h-screen flex bg-[#050A12] relative">
            {/* Global blueprint-grid background (base + grid + glow) */}
            <AppBlueprintBackground />
            {/* Subtle noise texture overlay */}
            <div className="pointer-events-none fixed inset-0 noise" />
            <Sidebar />
            <div className="flex-1 min-w-0 flex flex-col relative">
                <TopBar />
                <main data-testid="app-main" className="flex-1 overflow-x-hidden overflow-y-auto scrollbar-thin">
                    {children}
                </main>
            </div>
        </div>
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
