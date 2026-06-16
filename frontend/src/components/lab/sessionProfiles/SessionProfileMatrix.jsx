// SessionProfileMatrix — SESSION-STRATEGY-PROFILES Phase 1 (minimal control).
//
// A deliberately simple table: rows = sessions, columns = structure×direction
// cohorts. Each cell cycles Inherit → Enabled → Disabled. "Disabled" removes that
// cohort from the resolved trade universe everywhere (frontend-only mask, no
// rerun). Inherit/Enabled keep the trade. This is the first-pass UI, not the
// final polished matrix.
//
// Self-contained: subscribes to the store and reads/writes the session-profile
// slice directly, so mounting it costs StrategyBuilder one import + one element.

import React from "react";
import { NeonPanel, SectionTitle } from "@/components/lab/NeonPanel";
import { useDataset, getSessionProfiles, setSessionProfiles } from "@/data/store";
import {
    SESSIONS, CELLS, resolveCellState, countOverrides, isProfilesActive,
} from "@/data/sessionProfiles";

const NEXT_STATE = { inherit: "enabled", enabled: "disabled", disabled: "inherit" };
const CELL_LABEL = { inherit: "Inherit", enabled: "On", disabled: "Off" };
const CELL_CLASS = {
    inherit: "border-[hsl(var(--border-mid))] text-[hsl(var(--text-2))] hover:border-[hsl(var(--accent-secondary))]",
    enabled: "border-[hsl(var(--success)/0.6)] bg-[hsl(var(--success)/0.12)] text-[hsl(var(--success))]",
    disabled: "border-[hsl(var(--danger)/0.6)] bg-[hsl(var(--danger)/0.12)] text-[hsl(var(--danger))]",
};

export default function SessionProfileMatrix() {
    useDataset(); // re-render on store notify (profile writes, run switch, etc.)
    const profiles = getSessionProfiles();
    const overrides = countOverrides(profiles);
    const active = isProfilesActive(profiles);

    const setEnabled = (enabled) => setSessionProfiles({ ...profiles, enabled });

    const cycleCell = (sessionKey, cellKey) => {
        const current = resolveCellState(profiles, sessionKey, cellKey);
        const next = NEXT_STATE[current];
        const cells = { ...(profiles.cells || {}) };
        const row = { ...(cells[sessionKey] || {}) };
        if (next === "inherit") delete row[cellKey];
        else row[cellKey] = next;
        if (Object.keys(row).length) cells[sessionKey] = row;
        else delete cells[sessionKey];
        setSessionProfiles({ ...profiles, cells });
    };

    const clearAll = () => setSessionProfiles({ enabled: profiles.enabled, cells: {} });

    return (
        <NeonPanel
            title="Session Profiles"
            action={
                <button
                    onClick={() => setEnabled(!profiles.enabled)}
                    className={`clip-bevel-sm px-2.5 py-1 text-[11px] font-ui uppercase tracking-wider border transition-colors ${
                        profiles.enabled
                            ? "border-[hsl(var(--accent-primary))] bg-[hsl(var(--accent-primary)/0.15)] text-white"
                            : "border-[hsl(var(--border-mid))] text-[hsl(var(--text-2))] hover:border-[hsl(var(--accent-secondary))]"
                    }`}
                    data-testid="session-profiles-toggle"
                >
                    {profiles.enabled ? "Enabled" : "Disabled"}
                </button>
            }
        >
            <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                    <SectionTitle>Per-session structure × direction</SectionTitle>
                    <div className="mt-1 text-[10.5px] text-muted-lab">
                        Frontend-only mask over the resolved trade universe — no rerun. Click a cell to
                        cycle Inherit → On → Off. "Off" removes that cohort from results.
                    </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    <span className="clip-bevel-sm px-2 py-0.5 text-[9.5px] font-ui uppercase tracking-[0.08em] border border-[hsl(var(--border-mid))] text-[hsl(var(--text-2))]">
                        {overrides} override{overrides === 1 ? "" : "s"}
                    </span>
                    {overrides > 0 && (
                        <button
                            onClick={clearAll}
                            className="clip-bevel-sm px-2 py-0.5 text-[9.5px] font-ui uppercase tracking-[0.08em] border border-[hsl(var(--border-mid))] text-[hsl(var(--text-2))] hover:border-[hsl(var(--danger))] hover:text-[hsl(var(--danger))] transition-colors"
                        >
                            Reset
                        </button>
                    )}
                </div>
            </div>

            {profiles.enabled && overrides > 0 && !active && (
                <div className="mb-3 border border-[hsl(var(--warning)/0.4)] bg-[hsl(var(--warning)/0.06)] clip-bevel-sm px-3 py-2 text-[10.5px] font-ui text-[hsl(var(--warning))]">
                    No cohorts are set to "Off", so nothing is masked yet. Set a cell to Off to filter it out.
                </div>
            )}

            <div className={`overflow-x-auto ${profiles.enabled ? "" : "opacity-50 pointer-events-none"}`}>
                <table className="w-full border-collapse">
                    <thead>
                        <tr>
                            <th className="text-left text-[9.5px] font-ui uppercase tracking-[0.08em] text-muted-lab pb-2 pr-3">Session</th>
                            {CELLS.map((c) => (
                                <th key={c.key} className="text-center text-[9.5px] font-ui uppercase tracking-[0.08em] text-muted-lab pb-2 px-1">
                                    {c.label}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {SESSIONS.map((s) => (
                            <tr key={s.key}>
                                <td className="text-[11px] font-ui text-[hsl(var(--text-1))] py-1 pr-3 whitespace-nowrap">{s.label}</td>
                                {CELLS.map((c) => {
                                    const stateKey = resolveCellState(profiles, s.key, c.key);
                                    return (
                                        <td key={c.key} className="py-1 px-1 text-center">
                                            <button
                                                onClick={() => cycleCell(s.key, c.key)}
                                                className={`clip-bevel-sm w-full px-2 py-1 text-[10.5px] font-ui uppercase tracking-wider border transition-colors ${CELL_CLASS[stateKey]}`}
                                                data-testid={`session-profile-cell-${s.key}-${c.key}`}
                                                title={`${s.label} · ${c.label}: ${CELL_LABEL[stateKey]}`}
                                            >
                                                {CELL_LABEL[stateKey]}
                                            </button>
                                        </td>
                                    );
                                })}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </NeonPanel>
    );
}
