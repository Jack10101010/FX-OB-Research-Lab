import React from "react";
import { RefreshCw, Clock, FileInput, Plus, Database, Search } from "lucide-react";
import { cn } from "@/lib/utils";

export function TopBar() {
    return (
        <div data-testid="app-topbar" className="relative z-10 px-6 py-3 border-b border-[hsl(var(--border-soft))] bg-[hsl(var(--bg-2)/0.6)] backdrop-blur-xl">
            <div className="flex items-center gap-4 flex-wrap">
                <div className="flex items-center gap-2 font-mono text-[11px] text-muted-lab">
                    <span className="tracking-wider uppercase">Workspace</span>
                    <span className="text-white">EURUSD_M15_RR3.3</span>
                </div>
                <span className="hidden md:block h-4 w-px bg-[hsl(var(--border-soft))]" />
                <Pill icon={Database} label="Data Source" value="Local Data" tone="secondary" />
                <Pill icon={Clock} label="Timezone" value="Europe/Dublin · UTC" tone="muted" />
                <span className="hidden md:block h-4 w-px bg-[hsl(var(--border-soft))]" />
                <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel))/0.6] clip-bevel-sm">
                    <Search className="w-3.5 h-3.5 text-muted-lab" />
                    <input
                        data-testid="topbar-search"
                        placeholder="Search runs, trades, configs…"
                        className="bg-transparent outline-none text-[12px] font-mono w-56 placeholder:text-muted-lab"
                    />
                </div>
                <div className="flex-1" />
                <button
                    data-testid="topbar-load-config"
                    className="group inline-flex items-center gap-2 px-3 py-1.5 text-[12px] font-mono uppercase tracking-wider border border-[hsl(var(--border-mid))] hover:border-[hsl(var(--accent-secondary))] clip-bevel-sm transition-colors"
                >
                    <FileInput className="w-3.5 h-3.5 text-[hsl(var(--accent-secondary))]" />
                    Load Config
                </button>
                <button
                    data-testid="topbar-new-backtest"
                    className="group relative inline-flex items-center gap-2 px-3.5 py-1.5 text-[12px] font-mono uppercase tracking-wider clip-bevel-sm border border-[hsl(var(--accent-primary))] bg-[hsl(var(--accent-primary)/0.10)] text-white hover:bg-[hsl(var(--accent-primary)/0.20)] transition-colors"
                    style={{ boxShadow: "0 0 24px -8px hsl(var(--accent-primary))" }}
                >
                    <Plus className="w-3.5 h-3.5" />
                    New Backtest
                </button>
            </div>
            <div className="divider-glow mt-3" />
        </div>
    );
}

function Pill({ icon: Icon, label, value, tone }) {
    const dotColor =
        tone === "secondary" ? "hsl(var(--accent-secondary))" :
        tone === "primary"   ? "hsl(var(--accent-primary))" :
                               "hsl(var(--muted))";
    return (
        <div className="inline-flex items-center gap-2 px-2.5 py-1 border border-[hsl(var(--border-soft))] clip-bevel-sm bg-[hsl(var(--panel)/0.5)]">
            <span className="w-1.5 h-1.5 rounded-full animate-pulse-glow" style={{ background: dotColor, boxShadow: `0 0 8px ${dotColor}` }} />
            {Icon && <Icon className="w-3 h-3 text-muted-lab" />}
            <span className="text-[10px] font-mono uppercase tracking-wider text-muted-lab">{label}</span>
            <span className={cn("font-mono text-[11px]", tone === "muted" ? "text-white" : "text-white")}>{value}</span>
        </div>
    );
}
