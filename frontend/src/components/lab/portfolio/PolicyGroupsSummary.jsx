// PolicyGroupsSummary.jsx — the four PM action groups + cohort lists (shared).
//
// Used by the Best Validated Configuration section AND the Run Workspace per-run
// Portfolio Policy Summary (Part 11) so every run is self-describing. READ-ONLY:
// renders whatever policy table it is given — it never assumes the mirror matches a
// historical run (callers pass the stamped version and this component labels it).

import React, { useState } from "react";
import { POLICY_LABELS, POLICY_TONE, POLICY_TOOLTIPS, POLICY_SHORT } from "@/data/portfolioLabels";

const ACTION_ORDER = ["DIRECTION_AWARE", "STATE_ONLY", "LABEL", "DISABLE"];

export default function PolicyGroupsSummary({ table, instrument = "EURUSD", policyVersion, note, defaultOpen = false }) {
    const [open, setOpen] = useState(defaultOpen);
    const cohorts = (table?.cohorts || []).filter((c) => c.instrument === instrument);
    const grouped = {};
    for (const c of cohorts) (grouped[c.policy] = grouped[c.policy] || []).push(c);
    return (
        <div className="rounded-md border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel))] p-3" data-testid="policy-groups-summary">
            <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-ui text-[hsl(var(--accent-primary))]">Portfolio Policy Summary</span>
                {policyVersion && <span className="text-[10px] font-ui text-muted-lab" title="Policy version this summary describes">{policyVersion}</span>}
                <span className="ml-auto flex items-center gap-2">
                    {ACTION_ORDER.map((p) => (
                        <span key={p} title={`${POLICY_TOOLTIPS[p]} (${p})`}
                            className="inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-ui whitespace-nowrap"
                            style={{ borderColor: `hsl(var(--${POLICY_TONE[p]}))`, color: `hsl(var(--${POLICY_TONE[p]}))` }}>
                            {POLICY_LABELS[p]} · {(grouped[p] || []).length}
                        </span>
                    ))}
                    <button type="button" onClick={() => setOpen((v) => !v)} data-testid="policy-groups-toggle"
                        className="text-[10.5px] text-muted-lab hover:text-white font-ui">
                        {open ? "▴ Hide cohorts" : "▾ Show cohorts"}
                    </button>
                </span>
            </div>
            {note && <div className="mt-1 text-[10px] font-ui text-muted-lab">{note}</div>}
            {open && (
                <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2" data-testid="policy-groups-lists">
                    {ACTION_ORDER.filter((p) => (grouped[p] || []).length).map((p) => (
                        <div key={p} className="rounded border border-[hsl(var(--border-soft))] p-2">
                            <div className="flex items-center justify-between mb-1">
                                <span className="text-[10.5px] font-ui" style={{ color: `hsl(var(--${POLICY_TONE[p]}))` }}>
                                    {POLICY_LABELS[p]} <span className="text-[9px] text-muted-lab">({p})</span>
                                </span>
                                <span className="text-[9.5px] font-ui text-muted-lab">{POLICY_SHORT[p]}</span>
                            </div>
                            <ul className="text-[10.5px] font-ui text-[hsl(var(--text-2))] leading-relaxed">
                                {(grouped[p] || []).map((c) => (
                                    <li key={c.cohortKey}>{c.session} · {c.structure} · {c.direction}</li>
                                ))}
                            </ul>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
