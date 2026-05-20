import React from "react";
import { NavLink } from "react-router-dom";
import {
    LayoutDashboard, Wrench, ListOrdered, Activity, Map, Crosshair,
    FlaskConical, GitCompareArrows, ShieldCheck, Dices, Settings as Cog,
    Beaker, ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useTheme, THEMES } from "@/context/ThemeContext";

const NAV = [
    { to: "/",                label: "Overview",        icon: LayoutDashboard },
    { to: "/strategy",        label: "Strategy Builder", icon: Wrench },
    { to: "/runs",            label: "Runs",             icon: ListOrdered },
    { to: "/runs/active",     label: "Run Detail",       icon: Activity },
    { to: "/strategy-map",    label: "Strategy Map",     icon: Map },
    { to: "/trade-inspector", label: "Trade Inspector",  icon: Crosshair },
    { to: "/sweep",           label: "Sweep Lab",        icon: FlaskConical },
    { to: "/comparison",      label: "Comparison Lab",   icon: GitCompareArrows },
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
