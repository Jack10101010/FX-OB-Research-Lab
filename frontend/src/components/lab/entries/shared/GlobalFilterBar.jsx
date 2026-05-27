import React from "react";
import { cn } from "@/lib/utils";
import { Filter, X } from "lucide-react";
import { FilterToggle } from "@/components/lab/controls";
import { SESSIONS } from "../analytics/entryFormatters";

const DIRECTIONS = ["Long", "Short"];

export function GlobalFilterBar({ filters, toggleSession, toggleDirection, clearFilters, hasActiveFilters }) {
    const [open, setOpen] = React.useState(false);

    return (
        <div className="border-b border-[hsl(var(--border-soft)/0.5)] bg-[hsl(var(--panel)/0.5)]">
            <div className="px-6 py-2 flex items-center gap-3 flex-wrap">
                <FilterToggle
                    active={hasActiveFilters}
                    onClick={() => setOpen(o => !o)}
                    tone={hasActiveFilters ? "warning" : "primary"}
                    className={cn(
                        "gap-1.5",
                        !hasActiveFilters && "bg-transparent",
                    )}
                >
                    <Filter className="w-3 h-3" />
                    Filters
                    {hasActiveFilters && (
                        <span className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--warning))]" />
                    )}
                </FilterToggle>

                {filters.sessions.map(s => (
                    <FilterPill key={s} label={s} onRemove={() => toggleSession(s)} />
                ))}
                {filters.directions.map(d => (
                    <FilterPill key={d} label={d} onRemove={() => toggleDirection(d)} />
                ))}
                {hasActiveFilters && (
                    <button
                        type="button"
                        onClick={clearFilters}
                        className="flex items-center gap-1 text-[9.5px] font-display uppercase tracking-wider text-muted-lab hover:text-white transition-colors"
                    >
                        <X className="w-3 h-3" />
                        Clear all
                    </button>
                )}
            </div>

            {open && (
                <div className="px-6 pb-3 flex flex-wrap gap-4">
                    <FilterGroup label="Session" items={SESSIONS.filter(s => s !== "Unknown")} active={filters.sessions} onToggle={toggleSession} />
                    <FilterGroup label="Direction" items={DIRECTIONS} active={filters.directions} onToggle={toggleDirection} />
                </div>
            )}
        </div>
    );
}

function FilterGroup({ label, items, active, onToggle }) {
    return (
        <div className="flex items-center gap-2">
            <span className="text-[9.5px] font-display uppercase tracking-[0.2em] text-muted-lab w-16 shrink-0">{label}</span>
            <div className="flex flex-wrap gap-1.5">
                {items.map(item => {
                    const isActive = active.includes(item);
                    return (
                        <FilterToggle
                            key={item}
                            size="compact"
                            active={isActive}
                            onClick={() => onToggle(item)}
                            className={isActive ? "!text-white" : undefined}
                        >
                            {item}
                        </FilterToggle>
                    );
                })}
            </div>
        </div>
    );
}

function FilterPill({ label, onRemove }) {
    return (
        <span className="flex items-center gap-1 px-2 py-0.5 clip-bevel-sm border border-[hsl(var(--accent-primary)/0.5)] bg-[hsl(var(--accent-primary)/0.10)] text-[10px] font-display uppercase tracking-wider text-white">
            {label}
            <button type="button" onClick={onRemove} className="hover:text-[hsl(var(--danger))] transition-colors" aria-label={`Remove ${label} filter`}>
                <X className="w-2.5 h-2.5" />
            </button>
        </span>
    );
}
