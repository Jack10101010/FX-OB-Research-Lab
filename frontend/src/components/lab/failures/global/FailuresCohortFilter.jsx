// ── FailuresCohortFilter.jsx ─────────────────────────────────────────────────
// Persistent cohort filter bar for Failures Lab.
// Direction / session / archetype toggles + active filter pills + "Clear all".

import React from "react";
import { X, Filter, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { ARCHETYPES, archetypeLabel, archetypeTone } from "../shared/failuresRegistry";

const SESSIONS   = ["London", "New York", "Overlap", "Asia"];
const DIRECTIONS = ["Long", "Short"];

function Chip({ label, active, tone = "primary", onClick }) {
    const toneClasses = {
        primary:  active ? "border-[hsl(var(--accent-primary)/0.9)] bg-[hsl(var(--accent-primary)/0.15)] text-white"
                         : "border-[hsl(var(--border-mid))] text-[hsl(var(--text-2))] hover:border-[hsl(var(--accent-primary)/0.5)] hover:text-white",
        success:  active ? "border-[hsl(var(--success)/0.9)] bg-[hsl(var(--success)/0.15)] text-[hsl(var(--success))]"
                         : "border-[hsl(var(--border-mid))] text-[hsl(var(--text-2))] hover:border-[hsl(var(--success)/0.5)] hover:text-white",
        warning:  active ? "border-[hsl(var(--warning)/0.9)] bg-[hsl(var(--warning)/0.15)] text-[hsl(var(--warning))]"
                         : "border-[hsl(var(--border-mid))] text-[hsl(var(--text-2))] hover:border-[hsl(var(--warning)/0.5)] hover:text-white",
        danger:   active ? "border-[hsl(var(--danger)/0.9)] bg-[hsl(var(--danger)/0.15)] text-[hsl(var(--danger))]"
                         : "border-[hsl(var(--border-mid))] text-[hsl(var(--text-2))] hover:border-[hsl(var(--danger)/0.5)] hover:text-white",
        muted:    active ? "border-[hsl(var(--text-2)/0.9)] bg-[hsl(var(--text-2)/0.12)] text-white"
                         : "border-[hsl(var(--border-mid))] text-[hsl(var(--text-2))] hover:border-[hsl(var(--text-2)/0.5)] hover:text-white",
    };
    return (
        <button
            type="button"
            onClick={onClick}
            className={cn(
                "px-2.5 py-0.5 text-[10.5px] font-mono uppercase tracking-wider border clip-bevel-sm transition-all duration-100 select-none",
                toneClasses[tone] || toneClasses.primary,
            )}
        >
            {label}
        </button>
    );
}

function Section({ label, children }) {
    return (
        <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[9.5px] font-mono uppercase tracking-[0.2em] text-muted-lab min-w-[60px]">{label}</span>
            {children}
        </div>
    );
}

export function FailuresCohortFilter({
    filters,
    toggleSession,
    toggleDirection,
    toggleArchetype,
    clearFilters,
    hasActiveFilters,
    totalLosers = 0,
    filteredLosers = 0,
}) {
    const [expanded, setExpanded] = React.useState(false);

    const activeFilterPills = [
        ...filters.sessions.map(s => ({ key: `session:${s}`, label: `Session: ${s}`, onRemove: () => toggleSession(s) })),
        ...filters.directions.map(d => ({ key: `dir:${d}`, label: `Dir: ${d}`, onRemove: () => toggleDirection(d) })),
        ...filters.archetypes.map(a => ({ key: `arch:${a}`, label: archetypeLabel(a), onRemove: () => toggleArchetype(a) })),
        ...(filters.severityMin != null ? [{ key: "sev", label: `Severity ≥ ${filters.severityMin}`, onRemove: () => {} }] : []),
    ];

    return (
        <div className="border-b border-[hsl(var(--border-soft))] bg-[hsl(var(--bg-2)/0.6)] backdrop-blur-sm">
            {/* Header row */}
            <div className="flex items-center gap-3 px-6 py-2.5">
                <Filter className="w-3.5 h-3.5 text-[hsl(var(--accent-primary))] shrink-0" />
                <span className="text-[10.5px] font-mono uppercase tracking-[0.18em] text-[hsl(var(--text-2))]">
                    Cohort Filter
                </span>

                {/* Active filter pills */}
                {activeFilterPills.length > 0 && (
                    <div className="flex items-center gap-1.5 flex-wrap">
                        {activeFilterPills.map(pill => (
                            <span
                                key={pill.key}
                                className="flex items-center gap-1 px-2 py-0.5 text-[9.5px] font-mono bg-[hsl(var(--accent-primary)/0.12)] border border-[hsl(var(--accent-primary)/0.35)] clip-bevel-sm text-[hsl(var(--accent-primary))]"
                            >
                                {pill.label}
                                <button
                                    type="button"
                                    onClick={pill.onRemove}
                                    className="ml-0.5 hover:text-white transition-colors"
                                    aria-label={`Remove ${pill.label} filter`}
                                >
                                    <X className="w-2.5 h-2.5" />
                                </button>
                            </span>
                        ))}
                        <button
                            type="button"
                            onClick={clearFilters}
                            className="text-[9.5px] font-mono text-[hsl(var(--text-2))] hover:text-white underline underline-offset-2 transition-colors"
                        >
                            Clear all
                        </button>
                    </div>
                )}

                {/* Trade count */}
                <div className="ml-auto flex items-center gap-2">
                    {hasActiveFilters ? (
                        <span className="text-[10px] font-mono text-[hsl(var(--text-2))]">
                            <span className="text-white">{filteredLosers}</span>
                            <span className="text-muted-lab"> / {totalLosers} losers</span>
                        </span>
                    ) : (
                        <span className="text-[10px] font-mono text-muted-lab">
                            {totalLosers} losers
                        </span>
                    )}
                    <button
                        type="button"
                        onClick={() => setExpanded(v => !v)}
                        className="flex items-center gap-1 text-[9.5px] font-mono uppercase tracking-wider text-[hsl(var(--text-2))] hover:text-white transition-colors px-2 py-0.5 border border-[hsl(var(--border-soft))] clip-bevel-sm hover:border-[hsl(var(--border-mid))]"
                    >
                        {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                        {expanded ? "Hide" : "Filters"}
                    </button>
                </div>
            </div>

            {/* Expanded filter controls */}
            {expanded && (
                <div className="px-6 pb-3 space-y-2.5 border-t border-[hsl(var(--border-soft))] pt-3">
                    <Section label="Direction">
                        {DIRECTIONS.map(dir => (
                            <Chip
                                key={dir}
                                label={dir}
                                active={filters.directions.includes(dir)}
                                tone={dir === "Long" ? "success" : "danger"}
                                onClick={() => toggleDirection(dir)}
                            />
                        ))}
                    </Section>

                    <Section label="Session">
                        {SESSIONS.map(s => (
                            <Chip
                                key={s}
                                label={s}
                                active={filters.sessions.includes(s)}
                                tone="primary"
                                onClick={() => toggleSession(s)}
                            />
                        ))}
                    </Section>

                    <Section label="Archetype">
                        {ARCHETYPES.map(a => (
                            <Chip
                                key={a.id}
                                label={archetypeLabel(a.id)}
                                active={filters.archetypes.includes(a.id)}
                                tone={archetypeTone(a.id)}
                                onClick={() => toggleArchetype(a.id)}
                            />
                        ))}
                    </Section>
                </div>
            )}
        </div>
    );
}
