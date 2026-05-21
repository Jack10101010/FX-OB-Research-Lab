import React from "react";
import { NavLink } from "react-router-dom";
import {
    LayoutDashboard, Wrench, ListOrdered, Activity, Map, Crosshair,
    FlaskConical, GitCompareArrows, ShieldCheck, Dices, Settings as Cog,
    Beaker, Boxes, ChevronRight, MonitorCog, Lock, CalendarRange, ShieldAlert,
    MousePointerClick,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useTheme, THEMES } from "@/context/ThemeContext";

const NAV = [
    { to: "/",                label: "Overview",        icon: LayoutDashboard },
    { to: "/strategy",        label: "Strategy Builder", icon: Wrench },
    { to: "/runs",            label: "Runs",             icon: ListOrdered },
    { to: "/runs/active",     label: "Run Detail",       icon: Activity },
    { to: "/order-block-lab",  label: "Order Block Lab",  icon: Boxes },
    { to: "/protection-lab",  label: "Protection Lab",   icon: ShieldAlert },
    { to: "/entries-lab",     label: "Entries Lab",      icon: MousePointerClick },
    { to: "/strategy-map",    label: "Strategy Map",     icon: Map },
    { to: "/trade-inspector", label: "Trade Inspector",  icon: Crosshair },
    { to: "/sweep",           label: "Sweep Lab",        icon: FlaskConical },
    { to: "/comparison",      label: "Comparison Lab",   icon: GitCompareArrows },
    { to: "/walk-forward",    label: "Walk-Forward Lab", icon: CalendarRange },
    { to: "/parity",          label: "Parity Debugger",  icon: ShieldCheck },
    { to: "/monte-carlo",     label: "Monte Carlo",      icon: Dices },
    { to: "/settings",        label: "Settings",         icon: Cog },
];

export function Sidebar() {
    const { theme, setTheme } = useTheme();
    const current = THEMES.find((t) => t.id === theme) || THEMES[0];

    return (
        <aside
            data-testid="app-sidebar"
            className="hidden md:flex w-[232px] shrink-0 flex-col bg-[hsl(var(--bg-2)/0.78)] backdrop-blur-xl border-r border-[hsl(var(--border-soft))] relative"
        >
            {/* Logo */}
            <div className="px-5 pt-5 pb-4 border-b border-[hsl(var(--border-soft))]">
                <div className="flex items-center gap-2.5">
                    <div className="relative">
                        <div className="w-9 h-9 clip-bevel-sm p-[1px] bg-gradient-to-br from-[hsl(var(--accent-primary))] to-[hsl(var(--accent-secondary))]">
                            <div className="w-full h-full clip-bevel-sm bg-[hsl(var(--bg-2))] flex items-center justify-center">
                                <Beaker className="w-4 h-4 text-[hsl(var(--accent-primary))]" style={{ filter: "drop-shadow(0 0 6px hsl(var(--accent-primary)))" }} />
                            </div>
                        </div>
                    </div>
                    <div className="leading-tight">
                        <div className="font-display text-[14px] font-semibold tracking-wide">FX-OB</div>
                        <div className="text-[9.5px] font-mono uppercase tracking-[0.22em] text-muted-lab">Research Lab</div>
                    </div>
                </div>
            </div>

            {/* Nav */}
            <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto scrollbar-thin">
                {NAV.map((item) => (
                    <NavLink
                        key={item.to}
                        to={item.to}
                        end={item.to === "/"}
                        data-testid={`nav-${item.label.toLowerCase().replace(/\s+/g, "-")}`}
                        className={({ isActive }) =>
                            cn(
                                "group relative flex items-center gap-2.5 px-2.5 py-2 text-[12.5px] font-medium tracking-tight transition-all",
                                "text-[hsl(var(--text-2))] hover:text-white",
                                isActive
                                    ? "bg-[hsl(var(--accent-primary)/0.10)] text-white"
                                    : "hover:bg-[hsl(var(--panel-2))]",
                            )
                        }
                    >
                        {({ isActive }) => (
                            <>
                                <span
                                    className={cn(
                                        "absolute left-0 top-1 bottom-1 w-[2px] transition-opacity",
                                        isActive ? "bg-[hsl(var(--accent-primary))] opacity-100" : "opacity-0",
                                    )}
                                    style={isActive ? { boxShadow: "0 0 10px hsl(var(--accent-primary))" } : undefined}
                                />
                                <item.icon className={cn("w-4 h-4", isActive && "text-[hsl(var(--accent-primary))]")} />
                                <span>{item.label}</span>
                                {isActive && <ChevronRight className="w-3.5 h-3.5 ml-auto text-[hsl(var(--accent-primary))]" />}
                            </>
                        )}
                    </NavLink>
                ))}

                {/* Research Workstation — future desktop sidecar (placeholder) */}
                <div className="pt-3 mt-2 border-t border-[hsl(var(--border-soft))]">
                    <div className="px-2.5 mb-1 text-[9.5px] font-mono uppercase tracking-[0.22em] text-muted-lab">Roadmap</div>
                    <WorkstationItem />
                </div>
            </nav>

            {/* Theme selector preview */}
            <div className="px-3 pb-2">
                <div className="text-[9.5px] font-mono uppercase tracking-[0.22em] text-muted-lab px-1 mb-1.5">Theme</div>
                <div className="flex items-center gap-1.5 flex-wrap" data-testid="theme-quick-picker">
                    {THEMES.map((t) => (
                        <button
                            key={t.id}
                            onClick={() => setTheme(t.id)}
                            data-testid={`theme-swatch-${t.id}`}
                            title={t.name}
                            className={cn(
                                "w-6 h-6 clip-bevel-sm p-[1px] transition-transform hover:scale-110",
                                theme === t.id ? "ring-1 ring-white/40" : "",
                            )}
                            style={{ background: `linear-gradient(135deg, ${t.swatch[0]}, ${t.swatch[1]})` }}
                        >
                            <span className="block w-full h-full clip-bevel-sm bg-[hsl(var(--bg-2))]" />
                        </button>
                    ))}
                </div>
                <div className="px-1 mt-1.5 text-[10.5px] font-mono text-[hsl(var(--text-2))]">
                    {current.name}
                </div>
            </div>

            {/* Active config mini-card */}
            <div className="px-3 pb-3">
                <div className="clip-bevel-sm p-[1px] bg-gradient-to-br from-[hsl(var(--accent-primary)/0.45)] to-[hsl(var(--accent-secondary)/0.30)]">
                    <div className="clip-bevel-sm bg-[hsl(var(--panel))] px-3 py-2.5">
                        <div className="text-[9.5px] font-mono uppercase tracking-[0.22em] text-muted-lab">Active Config</div>
                        <div className="font-mono text-[11.5px] mt-1 text-white">EURUSD · M15</div>
                        <div className="flex items-center justify-between mt-1.5">
                            <span className="font-mono text-[10.5px] text-[hsl(var(--accent-secondary))]">RR 3.3</span>
                            <span className="font-mono text-[10.5px] text-[hsl(var(--success))]">+39.3R</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Profile */}
            <div className="px-3 pb-3 border-t border-[hsl(var(--border-soft))] pt-3 flex items-center gap-2.5">
                <div className="w-8 h-8 clip-bevel-sm bg-gradient-to-br from-[hsl(var(--accent-primary))] to-[hsl(var(--accent-secondary))] flex items-center justify-center text-[10px] font-mono font-bold text-[hsl(var(--bg))]">
                    QO
                </div>
                <div className="leading-tight">
                    <div className="text-[11.5px] font-medium">QuantOperator</div>
                    <div className="text-[9.5px] font-mono uppercase tracking-wider text-muted-lab">Research</div>
                </div>
            </div>
        </aside>
    );
}

// Disabled "Research Workstation" placeholder — future local desktop sidecar.
function WorkstationItem() {
    const [open, setOpen] = React.useState(false);
    return (
        <div
            className="relative"
            onMouseEnter={() => setOpen(true)}
            onMouseLeave={() => setOpen(false)}
            data-testid="nav-research-workstation"
        >
            <div
                aria-disabled="true"
                role="button"
                className="group relative flex items-center gap-2.5 px-2.5 py-2 text-[12.5px] font-medium tracking-tight cursor-not-allowed select-none border border-dashed border-[hsl(var(--border-mid))] clip-bevel-sm opacity-80 hover:opacity-100 transition-opacity"
            >
                <MonitorCog className="w-4 h-4 text-[hsl(var(--accent-secondary))]" />
                <span className="text-[hsl(var(--text-2))]">Research Workstation</span>
                <Lock className="w-3 h-3 ml-auto text-muted-lab" />
            </div>
            <div className="mt-1 flex items-center gap-1.5 px-2.5">
                <span
                    className="inline-flex items-center text-[8.5px] font-mono uppercase tracking-[0.22em] px-1.5 py-[1px] border border-[hsl(var(--accent-secondary)/0.5)] text-[hsl(var(--accent-secondary))] bg-[hsl(var(--accent-secondary)/0.06)] clip-bevel-sm"
                    data-testid="workstation-coming-soon-badge"
                >
                    Coming Soon
                </span>
                <span className="text-[9.5px] font-mono text-muted-lab">Desktop Mode</span>
            </div>
            {open && (
                <div
                    role="tooltip"
                    data-testid="workstation-tooltip"
                    className="absolute left-[210px] top-0 z-30 w-[270px] clip-bevel p-[1px] bg-gradient-to-br from-[hsl(var(--accent-secondary))] to-[hsl(var(--accent-primary))]"
                >
                    <div className="clip-bevel bg-[hsl(var(--panel))] p-3">
                        <div className="flex items-center gap-2">
                            <MonitorCog className="w-3.5 h-3.5 text-[hsl(var(--accent-secondary))]" />
                            <span className="text-[10.5px] font-mono uppercase tracking-[0.22em] text-[hsl(var(--accent-secondary))]">Coming Soon</span>
                        </div>
                        <div className="font-display text-[13px] text-white mt-1.5">Research Workstation</div>
                        <p className="text-[11px] text-[hsl(var(--text-2))] mt-1 leading-relaxed">
                            Future local desktop sidecar that turns this dashboard into a full research workstation:
                        </p>
                        <ul className="text-[10.5px] text-[hsl(var(--text-2))] mt-2 space-y-1 font-mono">
                            <li className="flex gap-2"><span className="text-[hsl(var(--accent-secondary))]">▸</span> Watch FX-OB-Backtester output folders</li>
                            <li className="flex gap-2"><span className="text-[hsl(var(--accent-secondary))]">▸</span> Auto-refresh new runs and sweeps</li>
                            <li className="flex gap-2"><span className="text-[hsl(var(--accent-secondary))]">▸</span> Trigger Python backtests from the UI</li>
                            <li className="flex gap-2"><span className="text-[hsl(var(--accent-secondary))]">▸</span> Launch parameter sweeps directly</li>
                            <li className="flex gap-2"><span className="text-[hsl(var(--accent-secondary))]">▸</span> Local file system access via sidecar</li>
                        </ul>
                    </div>
                </div>
            )}
        </div>
    );
}
