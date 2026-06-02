// ── FailuresCohortFilter.jsx ─────────────────────────────────────────────────
// Persistent cohort filter bar for Failures Lab.
// Direction / session / archetype toggles + active filter pills + "Clear all".

import React from "react";
import { X, Filter, ChevronDown, ChevronUp } from "lucide-react";
import { FilterToggle } from "@/components/lab/controls";
import { ARCHETYPES, archetypeLabel, archetypeTone } from "../shared/failuresRegistry";

const SESSIONS   = ["London", "New York", "Overlap", "Asia"];
const DIRECTIONS = ["Long", "Short"];

function Section({ label, children }) {
    return (
        <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[9.5px] font-display uppercase tracking-[0.2em] text-muted-lab min-w-[60px]">{label}</span>
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
    expanded,
    onExpandedChange,
}) {
    const [localExpanded, setLocalExpanded] = React.useState(false);
    const isExpanded = typeof expanded === "boolean" ? expanded : localExpanded;
    const setExpanded = onExpandedChange || setLocalExpanded;

    const activeFilterPills = [
        ...filters.sessions.map(s => ({ key: `session:${s}`, label: `Session: ${s}`, onRemove: () => toggleSession(s) })),
        ...filters.directions.map(d => ({ key: `dir:${d}`, label: `Dir: ${d}`, onRemove: () => toggleDirection(d) })),
        ...filters.archetypes.map(a => ({ key: `arch:${a}`, label: archetypeLabel(a), onRemove: () => toggleArchetype(a) })),
        ...(filters.severityMin != null ? [{ key: "sev", label: `Severity ≥ ${filters.severityMin}`, onRemove: () => {} }] : []),
    ];

    return (
        <div className="border-b border-[hsl(var(--border-soft))] bg-[hsl(var(--bg-2)/0.6)] backdrop-blur-sm">
            <div className="flex items-center gap-3 px-6 py-2.5">
                <Filter className="w-3.5 h-3.5 text-[hsl(var(--accent-primary))] shrink-0" />
                <span className="text-[10.5px] font-display uppercase tracking-[0.18em] text-[hsl(var(--text-2))]">
                    Cohort Filter
                </span>

                {activeFilterPills.length > 0 && (
                    <div className="flex items-center gap-1.5 flex-wrap">
                        {activeFilterPills.map(pill => (
                            <span
                                key={pill.key}
                                className="flex items-center gap-1 px-2 py-0.5 text-[9.5px] font-display bg-[hsl(var(--accent-primary)/0.12)] border border-[hsl(var(--accent-primary)/0.35)] clip-bevel-sm text-[hsl(var(--accent-primary))]"
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
                            className="text-[9.5px] font-display text-[hsl(var(--text-2))] hover:text-white underline underline-offset-2 transition-colors"
                        >
                            Clear all
                        </button>
                    </div>
                )}

                <div className="ml-auto flex items-center gap-2">
                    {hasActiveFilters ? (
                        <span className="text-[10px] font-ui text-[hsl(var(--text-2))]">
                            <span className="text-white">{filteredLosers}</span>
                            <span className="text-muted-lab"> / {totalLosers} losers</span>
                        </span>
                    ) : (
                        <span className="text-[10px] font-ui text-muted-lab">
                            {totalLosers} losers
                        </span>
                    )}
                    <FilterToggle
                        size="compact"
                        inactiveBorder="mid"
                        onClick={() => setExpanded(v => !v)}
                        className="gap-1"
                    >
                        {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                        {isExpanded ? "Hide" : "Filters"}
                    </FilterToggle>
                </div>
            </div>

            {isExpanded && (
                <div className="px-6 pb-3 space-y-2.5 border-t border-[hsl(var(--border-soft))] pt-3">
                    <Section label="Direction">
                        {DIRECTIONS.map(dir => (
                            <FilterToggle
                                key={dir}
                                size="compact"
                                tone={dir === "Long" ? "success" : "danger"}
                                inactiveBorder="mid"
                                active={filters.directions.includes(dir)}
                                onClick={() => toggleDirection(dir)}
                            >
                                {dir}
                            </FilterToggle>
                        ))}
                    </Section>

                    <Section label="Session">
                        {SESSIONS.map(s => (
                            <FilterToggle
                                key={s}
                                size="compact"
                                inactiveBorder="mid"
                                active={filters.sessions.includes(s)}
                                onClick={() => toggleSession(s)}
                            >
                                {s}
                            </FilterToggle>
                        ))}
                    </Section>

                    <Section label="Archetype">
                        {ARCHETYPES.map(a => (
                            <FilterToggle
                                key={a.id}
                                size="compact"
                                tone={archetypeTone(a.id)}
                                inactiveBorder="mid"
                                active={filters.archetypes.includes(a.id)}
                                onClick={() => toggleArchetype(a.id)}
                            >
                                {archetypeLabel(a.id)}
                            </FilterToggle>
                        ))}
                    </Section>
                </div>
            )}
        </div>
    );
}
