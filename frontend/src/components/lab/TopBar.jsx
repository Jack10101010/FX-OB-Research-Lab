import React from "react";
import { useNavigate } from "react-router-dom";
import { Clock, Plus, Database, Search, FolderKanban, Activity, ChevronDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import {
    useDataset,
    setActiveProjectId,
    setActiveRunId,
    getRunDisplayName,
    compactTimeframe,
} from "@/data/store";

export function TopBar() {
    const navigate = useNavigate();
    return (
        <div data-testid="app-topbar" className="relative z-20 px-6 py-3 border-b border-[hsl(var(--border-soft))] bg-[hsl(var(--bg-2)/0.6)] backdrop-blur-xl">
            <div className="flex items-center gap-3 flex-wrap">
                <ProjectSwitcher />
                <RunSwitcher />
                <span className="hidden md:block h-4 w-px bg-[hsl(var(--border-soft))]" />
                <Pill icon={Database} label="Data Source" value="Local Data" tone="secondary" />
                <Pill icon={Clock} label="TZ" value="Europe/Dublin · UTC" tone="muted" />
                <span className="hidden lg:block h-4 w-px bg-[hsl(var(--border-soft))]" />
                <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel))/0.6] clip-bevel-sm">
                    <Search className="w-3.5 h-3.5 text-muted-lab" />
                    <input
                        data-testid="topbar-search"
                        placeholder="Search runs, trades, configs…"
                        className="bg-transparent outline-none text-[12px] font-ui w-44 placeholder:text-muted-lab"
                    />
                </div>
                <div className="flex-1" />
                <button
                    data-testid="topbar-new-backtest"
                    onClick={() => navigate("/strategy")}
                    className="group relative inline-flex items-center gap-2 px-3.5 py-1.5 text-[12px] font-ui uppercase tracking-wider clip-bevel-sm border border-[hsl(var(--accent-primary))] bg-[hsl(var(--accent-primary)/0.10)] text-white hover:bg-[hsl(var(--accent-primary)/0.20)] transition-colors"
                    style={{ boxShadow: "0 0 24px -8px hsl(var(--accent-primary))" }}
                >
                    <Plus className="w-3.5 h-3.5" />
                    New Backtest
                </button>
            </div>
        </div>
    );
}

// ───────────────────────────── Project switcher ─────────────────────────────
function ProjectSwitcher() {
    const { PROJECTS, activeProjectId } = useDataset();
    const projects = PROJECTS || [];
    const active = projects.find((p) => p.id === activeProjectId) || null;
    const label = active ? active.name : "No Project";

    const options = [
        { id: null, label: "No Project", sub: "Show all / unscoped" },
        ...projects.map((p) => ({
            id: p.id,
            label: p.name,
            sub: [p.symbol, p.timeframe].filter(Boolean).join(" · ") || `${p.runIds?.length || 0} runs`,
        })),
    ];

    return (
        <Switcher
            testId="topbar-project-switcher"
            icon={FolderKanban}
            kicker="Project"
            value={label}
            tone="secondary"
            empty={!active}
            options={options}
            selectedId={activeProjectId || null}
            onSelect={(id) => setActiveProjectId(id)}
        />
    );
}

// ─────────────────────────────── Run switcher ───────────────────────────────
function RunSwitcher() {
    const { RUNS, activeRunId } = useDataset();
    const runs = RUNS || [];
    const active = runs.find((r) => r.id === activeRunId) || null;
    const label = active ? getRunDisplayName(active) : "No Active Run";

    const options = [
        { id: null, label: "No Active Run", sub: "Clear selection" },
        ...runs.map((r) => {
            const tf = compactTimeframe(r.detectionTf);
            const sub = [r.symbol, tf, r.projectName && r.projectName !== "Unassigned" ? r.projectName : null]
                .filter(Boolean)
                .join(" · ");
            return { id: r.id, label: getRunDisplayName(r), sub: sub || r.id };
        }),
    ];

    return (
        <Switcher
            testId="topbar-run-switcher"
            icon={Activity}
            kicker="Active Run"
            value={label}
            tone="primary"
            empty={!active}
            options={options}
            selectedId={activeRunId || null}
            onSelect={(id) => setActiveRunId(id)}
        />
    );
}

// ─────────────────────── Shared compact dropdown switcher ────────────────────
function Switcher({ testId, icon: Icon, kicker, value, tone, empty, options, selectedId, onSelect }) {
    const [open, setOpen] = React.useState(false);
    const ref = React.useRef(null);

    React.useEffect(() => {
        if (!open) return undefined;
        const onDocClick = (e) => {
            if (ref.current && !ref.current.contains(e.target)) setOpen(false);
        };
        const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
        document.addEventListener("mousedown", onDocClick);
        document.addEventListener("keydown", onKey);
        return () => {
            document.removeEventListener("mousedown", onDocClick);
            document.removeEventListener("keydown", onKey);
        };
    }, [open]);

    const dotColor = tone === "primary" ? "hsl(var(--accent-primary))" : "hsl(var(--accent-secondary))";

    return (
        <div className="relative" ref={ref}>
            <button
                type="button"
                data-testid={testId}
                onClick={() => setOpen((v) => !v)}
                title={value}
                className={cn(
                    "inline-flex items-center gap-2 px-2.5 py-1 max-w-[220px] border clip-bevel-sm bg-[hsl(var(--panel)/0.6)] transition-colors",
                    open ? "border-[hsl(var(--accent-primary)/0.5)]" : "border-[hsl(var(--border-soft))] hover:border-[hsl(var(--border-mid))]",
                )}
            >
                <span
                    className="w-1.5 h-1.5 rounded-full shrink-0"
                    style={empty ? { background: "hsl(var(--muted))" } : { background: dotColor, boxShadow: `0 0 8px ${dotColor}` }}
                />
                {Icon && <Icon className="w-3 h-3 text-muted-lab shrink-0" />}
                <span className="text-[9.5px] font-ui uppercase tracking-wider text-muted-lab shrink-0">{kicker}</span>
                <span className={cn("font-ui text-[11px] truncate", empty ? "text-muted-lab" : "text-white")}>{value}</span>
                <ChevronDown className={cn("w-3 h-3 text-muted-lab shrink-0 transition-transform", open && "rotate-180")} />
            </button>

            {open && (
                <div
                    role="listbox"
                    data-testid={`${testId}-menu`}
                    className="absolute left-0 mt-1.5 w-[260px] max-h-[320px] overflow-y-auto scrollbar-thin clip-bevel p-[1px] bg-gradient-to-br from-[hsl(var(--accent-primary)/0.4)] to-[hsl(var(--accent-secondary)/0.3)] z-30"
                >
                    <div className="clip-bevel bg-[hsl(var(--panel))] py-1">
                        {options.length === 0 && (
                            <div className="px-3 py-3 text-[11px] font-ui text-muted-lab">Nothing available</div>
                        )}
                        {options.map((opt) => {
                            const isSelected = (opt.id || null) === (selectedId || null);
                            return (
                                <button
                                    key={opt.id ?? "__none__"}
                                    type="button"
                                    role="option"
                                    aria-selected={isSelected}
                                    onClick={() => { onSelect(opt.id); setOpen(false); }}
                                    className={cn(
                                        "w-full text-left px-3 py-2 flex items-center gap-2 transition-colors",
                                        isSelected ? "bg-[hsl(var(--accent-primary)/0.10)]" : "hover:bg-[hsl(var(--panel-2))]",
                                    )}
                                >
                                    <span className="w-3 shrink-0">
                                        {isSelected && <Check className="w-3 h-3 text-[hsl(var(--accent-primary))]" />}
                                    </span>
                                    <span className="min-w-0">
                                        <span className={cn("block font-ui text-[12px] truncate", isSelected ? "text-white" : "text-[hsl(var(--text-2))]")}>
                                            {opt.label}
                                        </span>
                                        {opt.sub && (
                                            <span className="block text-[10px] font-ui text-muted-lab truncate">{opt.sub}</span>
                                        )}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}

function Pill({ icon: Icon, label, value, tone }) {
    const dotColor =
        tone === "secondary" ? "hsl(var(--accent-secondary))" :
        tone === "primary"   ? "hsl(var(--accent-primary))" :
                               "hsl(var(--muted))";
    return (
        <div className="hidden md:inline-flex items-center gap-2 px-2.5 py-1 border border-[hsl(var(--border-soft))] clip-bevel-sm bg-[hsl(var(--panel)/0.5)]">
            <span className="w-1.5 h-1.5 rounded-full animate-pulse-glow" style={{ background: dotColor, boxShadow: `0 0 8px ${dotColor}` }} />
            {Icon && <Icon className="w-3 h-3 text-muted-lab" />}
            <span className="text-[10px] font-ui uppercase tracking-wider text-muted-lab">{label}</span>
            <span className="font-ui text-[11px] text-white">{value}</span>
        </div>
    );
}
