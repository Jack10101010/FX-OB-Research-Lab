import React from "react";
import { NavLink } from "react-router-dom";
import {
    LayoutDashboard, Wrench, ListOrdered, Activity, Map, Crosshair,
    FlaskConical, GitCompareArrows, ShieldCheck, Dices, Settings as Cog,
    Beaker, Boxes, ChevronRight, MonitorCog, Lock, CalendarRange, ShieldAlert,
    MousePointerClick, TestTubeDiagonal, Newspaper, FolderKanban,
    BookOpen, ChevronLeft, Microscope, Lightbulb, Clock, Gauge,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useTheme, THEMES } from "@/context/ThemeContext";
import { useDataset, compactTimeframe } from "@/data/store";

const SIDEBAR_COLLAPSED_KEY = "fxob_sidebar_collapsed_v1";

// Grouped navigation (WF-1). Routes are unchanged — only labels/order/section
// headers. "Run Detail" is relabeled "Run Workspace". No routes removed.
const NAV_GROUPS = [
    {
        section: "Workspace",
        items: [
            // COCKPIT-1: top-level read-only research summary, above the labs.
            { to: "/cockpit",   label: "Research Cockpit", icon: Gauge },
            { to: "/",          label: "Overview",        icon: LayoutDashboard },
            { to: "/projects",  label: "Projects",        icon: FolderKanban },
            { to: "/runs",      label: "Runs",            icon: ListOrdered },
            { to: "/insights",  label: "Insights",        icon: Lightbulb },
        ],
    },
    {
        section: "Build & Run",
        items: [
            { to: "/strategy",       label: "Strategy Builder", icon: Wrench },
            { to: "/strategy-logic", label: "Strategy Logic",   icon: BookOpen },
        ],
    },
    {
        section: "Analyze",
        items: [
            { to: "/runs/active",     label: "Run Workspace",   icon: Activity },
            { to: "/strategy-map",    label: "Strategy Map",    icon: Map },
            { to: "/order-block-lab", label: "Order Block Lab", icon: Boxes },
            { to: "/entries-lab",     label: "Entries Lab",     icon: MousePointerClick },
            { to: "/protection-lab",  label: "Protection Lab",  icon: ShieldAlert },
            { to: "/news-lab",        label: "News Lab",        icon: Newspaper },
            { to: "/trade-inspector", label: "Trade Inspector", icon: Crosshair },
            { to: "/failures-lab",    label: "Failures Lab",    icon: Microscope },
            { to: "/session-lab",         label: "Session Lab",         icon: Clock },
            { to: "/session-lab-classic", label: "Session Lab Classic",  icon: FlaskConical, badge: "Classic" },
        ],
    },
    {
        section: "Compare & Validate",
        items: [
            { to: "/comparison",     label: "Comparison Lab",  icon: GitCompareArrows },
            { to: "/sweep",          label: "Sweep Lab",       icon: FlaskConical },
            { to: "/walk-forward",   label: "Walk-Forward Lab", icon: CalendarRange },
            { to: "/hypothesis-lab", label: "Hypothesis Lab",  icon: TestTubeDiagonal },
            { to: "/monte-carlo",    label: "Monte Carlo",     icon: Dices },
        ],
    },
    {
        section: "Utilities",
        items: [
            { to: "/settings",       label: "Settings",        icon: Cog },
            { to: "/workflow-guide", label: "Workflow Guide",  icon: Beaker },
            { to: "/parity",         label: "Parity Debugger", icon: ShieldCheck },
        ],
    },
];

export function Sidebar() {
    const { theme, setTheme } = useTheme();
    const current = THEMES.find((t) => t.id === theme) || THEMES[0];
    const { ACTIVE_RUN } = useDataset();
    const hasRun = Boolean(ACTIVE_RUN?.id);
    const symbol = ACTIVE_RUN?.symbol || "—";
    const tf = compactTimeframe(ACTIVE_RUN?.detectionTf) || ACTIVE_RUN?.detectionTf || "—";
    const rr = hasRun && Number(ACTIVE_RUN?.rr) > 0 ? `RR ${Number(ACTIVE_RUN.rr).toFixed(1)}` : "—";
    const netRVal = hasRun ? (ACTIVE_RUN?.netR ?? 0) : null;
    const netRLabel = netRVal !== null ? `${netRVal >= 0 ? "+" : ""}${Number(netRVal).toFixed(1)}R` : "—";
    const netRColor = netRVal === null ? "text-muted-lab" : netRVal > 0 ? "text-[hsl(var(--success))]" : netRVal < 0 ? "text-[hsl(var(--danger))]" : "text-muted-lab";
    const [collapsed, setCollapsed] = React.useState(() => {
        try {
            return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "true";
        } catch {
            return false;
        }
    });

    React.useEffect(() => {
        try {
            localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(collapsed));
        } catch {
            // Non-critical display preference.
        }
    }, [collapsed]);

    return (
        <aside
            data-testid="app-sidebar"
            className={cn(
                "hidden md:flex shrink-0 flex-col bg-[hsl(var(--bg-2)/0.78)] backdrop-blur-xl border-r border-[hsl(var(--border-soft))] relative transition-[width] duration-200 ease-out",
                collapsed ? "w-[72px]" : "w-[232px]",
            )}
        >
            {/* Logo */}
            <div className={cn("pt-5 pb-4 border-b border-[hsl(var(--border-soft))]", collapsed ? "px-3" : "px-5")}>
                <div className={cn("flex items-center", collapsed ? "justify-center" : "gap-2.5")}>
                    <div className="relative">
                        <div className="w-9 h-9 clip-bevel-sm p-[1px] bg-gradient-to-br from-[hsl(var(--accent-primary))] to-[hsl(var(--accent-secondary))]">
                            <div className="w-full h-full clip-bevel-sm bg-[hsl(var(--bg-2))] flex items-center justify-center">
                                <Beaker className="w-4 h-4 text-[hsl(var(--accent-primary))]" style={{ filter: "drop-shadow(0 0 6px hsl(var(--accent-primary)))" }} />
                            </div>
                        </div>
                    </div>
                    {!collapsed && <div className="leading-tight">
                        <div className="font-display text-[14px] font-semibold tracking-wide">FX-OB</div>
                        <div className="text-[9.5px] font-ui uppercase tracking-[0.14em] text-muted-lab">Research Lab</div>
                    </div>}
                </div>
                <button
                    type="button"
                    onClick={() => setCollapsed((value) => !value)}
                    className={cn(
                        "absolute top-4 right-2 w-7 h-7 grid place-items-center clip-bevel-sm border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel)/0.75)] text-[hsl(var(--text-2))] hover:text-white hover:border-[hsl(var(--accent-primary)/0.45)] transition-colors",
                        collapsed && "right-[-14px] bg-[hsl(var(--panel))]",
                    )}
                    aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                    title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                >
                    <ChevronLeft className={cn("w-3.5 h-3.5 transition-transform", collapsed && "rotate-180")} />
                </button>
            </div>

            {/* Nav */}
            <nav className={cn("flex-1 py-4 overflow-y-auto scrollbar-thin", collapsed ? "px-2" : "px-3")}>
                {NAV_GROUPS.map((group, groupIndex) => (
                    <div key={group.section} className={cn("space-y-0.5", groupIndex > 0 && (collapsed ? "mt-3 pt-3 border-t border-[hsl(var(--border-soft))]" : "mt-4"))}>
                        {!collapsed && (
                            <div className="px-2.5 mb-1 text-[9.5px] font-ui uppercase tracking-[0.14em] text-muted-lab">
                                {group.section}
                            </div>
                        )}
                        {group.items.map((item) => (
                            <NavLink
                                key={item.to}
                                to={item.to}
                                end={item.to === "/"}
                                data-testid={`nav-${item.label.toLowerCase().replace(/\s+/g, "-")}`}
                                title={collapsed ? item.label : undefined}
                                aria-label={item.label}
                                className={({ isActive }) =>
                                    cn(
                                        "group relative flex items-center py-2 text-[12.5px] font-medium tracking-tight transition-all",
                                        collapsed ? "justify-center px-0" : "gap-2.5 px-2.5",
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
                                        {!collapsed && <span>{item.label}</span>}
                                        {!collapsed && item.badge && <span className="ml-auto text-[9px] font-ui px-1 py-0.5 rounded bg-[hsl(var(--warning)/0.15)] text-[hsl(var(--warning))] leading-none">{item.badge}</span>}
                                        {isActive && !collapsed && !item.badge && <ChevronRight className="w-3.5 h-3.5 ml-auto text-[hsl(var(--accent-primary))]" />}
                                    </>
                                )}
                            </NavLink>
                        ))}
                    </div>
                ))}

                {/* Research Workstation — future desktop sidecar (placeholder) */}
                <div className="pt-3 mt-2 border-t border-[hsl(var(--border-soft))]">
                    {!collapsed && <div className="px-2.5 mb-1 text-[9.5px] font-ui uppercase tracking-[0.14em] text-muted-lab">Roadmap</div>}
                    <WorkstationItem collapsed={collapsed} />
                    <RoadmapItem
                        testId="nav-ai-review"
                        label="AI Review"
                        sublabel="Future"
                        collapsed={collapsed}
                    />
                    <RoadmapItem
                        testId="nav-local-runner"
                        label="Local Runner"
                        sublabel="Experimental"
                        collapsed={collapsed}
                    />
                </div>
            </nav>

            {/* Theme selector preview */}
            <div className={cn("pb-2", collapsed ? "px-2" : "px-3")}>
                {!collapsed && <div className="text-[9.5px] font-ui uppercase tracking-[0.14em] text-muted-lab px-1 mb-1.5">Theme</div>}
                <div className={cn("flex items-center gap-1.5 flex-wrap", collapsed && "justify-center")} data-testid="theme-quick-picker">
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
                {!collapsed && <div className="px-1 mt-1.5 text-[10.5px] font-ui text-[hsl(var(--text-2))]">
                    {current.name}
                </div>}
            </div>

            {/* Active config mini-card */}
            <div className={cn("pb-3", collapsed ? "px-2" : "px-3")}>
                <div className="clip-bevel-sm p-[1px] bg-gradient-to-br from-[hsl(var(--accent-primary)/0.45)] to-[hsl(var(--accent-secondary)/0.30)]">
                    <div className={cn("clip-bevel-sm bg-[hsl(var(--panel))]", collapsed ? "px-2 py-2 text-center" : "px-3 py-2.5")}>
                        {collapsed ? (
                            <div
                                className="font-num text-[10px] text-[hsl(var(--accent-secondary))]"
                                title={hasRun ? `Active Config: ${symbol} · ${tf} · ${rr}` : "No active run"}
                            >
                                {hasRun ? tf : "—"}
                            </div>
                        ) : (
                            <>
                                <div className="text-[9.5px] font-ui uppercase tracking-[0.14em] text-muted-lab">Active Config</div>
                                <div className="font-ui text-[11.5px] mt-1 text-white">
                                    {hasRun ? `${symbol} · ${tf}` : "No active run"}
                                </div>
                                <div className="flex items-center justify-between mt-1.5">
                                    <span className="font-num text-[10.5px] text-[hsl(var(--accent-secondary))]">{rr}</span>
                                    <span className={cn("font-num text-[10.5px]", netRColor)}>{netRLabel}</span>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </div>

            {/* Profile */}
            <div className={cn("px-3 pb-3 border-t border-[hsl(var(--border-soft))] pt-3 flex items-center", collapsed ? "justify-center" : "gap-2.5")}>
                <div className="w-8 h-8 clip-bevel-sm bg-gradient-to-br from-[hsl(var(--accent-primary))] to-[hsl(var(--accent-secondary))] flex items-center justify-center text-[10px] font-ui font-bold text-[hsl(var(--bg))]">
                    QO
                </div>
                {!collapsed && <div className="leading-tight">
                    <div className="text-[11.5px] font-medium">QuantOperator</div>
                    <div className="text-[9.5px] font-ui uppercase tracking-wider text-muted-lab">Research</div>
                </div>}
            </div>
        </aside>
    );
}

function RoadmapItem({ testId, label, sublabel, collapsed = false }) {
    return (
        <div className="relative mt-2" data-testid={testId}>
            <div
                aria-disabled="true"
                role="button"
                title={collapsed ? `${label} · ${sublabel}` : undefined}
                className={cn(
                    "group relative flex items-center py-2 text-[12.5px] font-medium tracking-tight cursor-not-allowed select-none border border-dashed border-[hsl(var(--border-mid))] clip-bevel-sm opacity-80 hover:opacity-100 transition-opacity",
                    collapsed ? "justify-center px-0" : "gap-2.5 px-2.5",
                )}
            >
                <MonitorCog className="w-4 h-4 text-[hsl(var(--accent-secondary))]" />
                {!collapsed && <span className="text-[hsl(var(--text-2))]">{label}</span>}
                {!collapsed && <Lock className="w-3 h-3 ml-auto text-muted-lab" />}
            </div>
            {!collapsed && <div className="mt-1 flex items-center gap-1.5 px-2.5">
                <span className="inline-flex items-center text-[8.5px] font-ui uppercase tracking-[0.10em] px-1.5 py-[1px] border border-[hsl(var(--accent-secondary)/0.5)] text-[hsl(var(--accent-secondary))] bg-[hsl(var(--accent-secondary)/0.06)] clip-bevel-sm">
                    Coming Soon
                </span>
                <span className="text-[9.5px] font-ui text-muted-lab">{sublabel}</span>
            </div>}
        </div>
    );
}

// Disabled "Research Workstation" placeholder — future local desktop sidecar.
function WorkstationItem({ collapsed = false }) {
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
                title={collapsed ? "Research Workstation · Desktop Mode" : undefined}
                className={cn(
                    "group relative flex items-center py-2 text-[12.5px] font-medium tracking-tight cursor-not-allowed select-none border border-dashed border-[hsl(var(--border-mid))] clip-bevel-sm opacity-80 hover:opacity-100 transition-opacity",
                    collapsed ? "justify-center px-0" : "gap-2.5 px-2.5",
                )}
            >
                <MonitorCog className="w-4 h-4 text-[hsl(var(--accent-secondary))]" />
                {!collapsed && <span className="text-[hsl(var(--text-2))]">Research Workstation</span>}
                {!collapsed && <Lock className="w-3 h-3 ml-auto text-muted-lab" />}
            </div>
            {!collapsed && <div className="mt-1 flex items-center gap-1.5 px-2.5">
                <span
                    className="inline-flex items-center text-[8.5px] font-ui uppercase tracking-[0.10em] px-1.5 py-[1px] border border-[hsl(var(--accent-secondary)/0.5)] text-[hsl(var(--accent-secondary))] bg-[hsl(var(--accent-secondary)/0.06)] clip-bevel-sm"
                    data-testid="workstation-coming-soon-badge"
                >
                    Coming Soon
                </span>
                <span className="text-[9.5px] font-ui text-muted-lab">Desktop Mode</span>
            </div>}
            {open && (
                <div
                    role="tooltip"
                    data-testid="workstation-tooltip"
                    className={cn(
                        "absolute top-0 z-30 w-[270px] clip-bevel p-[1px] bg-gradient-to-br from-[hsl(var(--accent-secondary))] to-[hsl(var(--accent-primary))]",
                        collapsed ? "left-[58px]" : "left-[210px]",
                    )}
                >
                    <div className="clip-bevel bg-[hsl(var(--panel))] p-3">
                        <div className="flex items-center gap-2">
                            <MonitorCog className="w-3.5 h-3.5 text-[hsl(var(--accent-secondary))]" />
                            <span className="text-[10.5px] font-ui uppercase tracking-[0.10em] text-[hsl(var(--accent-secondary))]">Coming Soon</span>
                        </div>
                        <div className="font-display text-[13px] text-white mt-1.5">Research Workstation</div>
                        <p className="text-[11px] text-[hsl(var(--text-2))] mt-1 leading-relaxed">
                            Future local desktop sidecar that turns this dashboard into a full research workstation:
                        </p>
                        <ul className="text-[10.5px] text-[hsl(var(--text-2))] mt-2 space-y-1 font-ui">
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
