// SessionProfileMatrix — SESSION-STRATEGY-CARDS: compact OVERVIEW.
//
// Phase 1 shipped this as the editing matrix. In Phase 2A the editing surface
// moves to Session Strategy Cards; this becomes a read-only "all sessions at a
// glance" status grid (sessions × cohorts), reused inside SessionStrategyCards.
//
// Status per cohort (resolved override → card default → inherit):
//   Off      — cohort disabled            (danger)
//   Set      — entry / BE override active (accent)
//   —        — inherit / unchanged        (muted)
//
// Self-contained: subscribes to the store; no props required. Read-only.

import React from "react";
import { useDataset, getSessionProfiles } from "@/data/store";
import { SESSIONS, CELLS, resolveCohortConfig } from "@/data/sessionProfiles";

function cohortStatus(profiles, sessionKey, cellKey) {
    const cfg = resolveCohortConfig(profiles, sessionKey, cellKey);
    if (cfg.disabled) return "off";
    if (cfg.entry || cfg.be) return "set";
    return "inherit";
}

const STATUS_LABEL = { off: "Off", set: "Set", inherit: "—" };
const STATUS_CLASS = {
    off: "border-[hsl(var(--danger)/0.6)] bg-[hsl(var(--danger)/0.12)] text-[hsl(var(--danger))]",
    set: "border-[hsl(var(--accent-primary)/0.6)] bg-[hsl(var(--accent-primary)/0.12)] text-[hsl(var(--accent-primary))]",
    inherit: "border-[hsl(var(--border-mid))] text-[hsl(var(--text-2))]",
};

export default function SessionProfileMatrix() {
    useDataset();
    const profiles = getSessionProfiles();

    return (
        <div className="overflow-x-auto">
            <table className="w-full border-collapse">
                <thead>
                    <tr>
                        <th className="text-left text-[9.5px] font-ui uppercase tracking-[0.08em] text-muted-lab pb-2 pr-3">Overview</th>
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
                            <td className="text-[11px] font-ui text-[hsl(var(--text-1))] py-0.5 pr-3 whitespace-nowrap">{s.label}</td>
                            {CELLS.map((c) => {
                                const st = cohortStatus(profiles, s.key, c.key);
                                return (
                                    <td key={c.key} className="py-0.5 px-1 text-center">
                                        <span className={`inline-block min-w-[2.4rem] clip-bevel-sm px-1.5 py-0.5 text-[9.5px] font-ui uppercase tracking-[0.04em] border ${STATUS_CLASS[st]}`}>
                                            {STATUS_LABEL[st]}
                                        </span>
                                    </td>
                                );
                            })}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
