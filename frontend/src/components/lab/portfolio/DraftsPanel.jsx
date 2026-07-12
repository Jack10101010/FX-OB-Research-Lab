// DraftsPanel.jsx — Trade Policy → Drafts tab (SB-V2 UX polish).
//
// The ONE home for state-policy research drafts inside the builder. Signature-scoped
// (this builder configuration's strategy signature only — never another universe's
// research). Read + apply here; drafts are AUTHORED in the Run Workspace drilldown
// where the evidence lives. "Apply confirmed drafts" is the ONLY bridge from research
// to execution and only ever writes the visible builder cfg fields.

import React, { useMemo, useSyncExternalStore } from "react";
import {
    listDrafts, draftCounts, applyDraftsToOverrides, buildStrategySignature,
    DRAFT_STATUSES, DRAFT_TERMINAL, subscribeDrafts,
} from "@/data/statePolicyDrafts";
import { builderSignatureParts } from "@/data/stateTargetOverrides";
import { StateHeader } from "./stateDisplay";

const card = "rounded-md border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel))]";
const STATUS_TONE = {
    Inspect: "text-3", Candidate: "text-2", Confirmed: "success",
    "Added to Run": "accent-primary", "Native Validated": "accent-primary",
    Approved: "success", Deployed: "success", [DRAFT_TERMINAL]: "danger",
};

export default function DraftsPanel({ cfg, onField }) {
    const signature = useMemo(() => buildStrategySignature(builderSignatureParts(cfg || {})), [cfg]);
    // Re-render when the draft store changes (authored from the Run Workspace).
    useSyncExternalStore(subscribeDrafts, () => JSON.stringify(draftCounts(signature)));
    const drafts = useMemo(() => listDrafts(signature), [signature]);
    const counts = draftCounts(signature);
    const rows = Object.entries(drafts).map(([k, d]) => {
        const [cohortKey, state] = k.split("::");
        return { cohortKey, state, ...d };
    }).sort((a, b) => a.cohortKey.localeCompare(b.cohortKey) || a.state.localeCompare(b.state));

    const applyConfirmed = () => {
        const { overrides, appliedCount } = applyDraftsToOverrides(signature, cfg?.stateTargetOverrides);
        if (!appliedCount) return;
        onField("stateTargetOverrides", overrides);
        if (!cfg?.stateOverridesEnabled) onField("stateOverridesEnabled", true);
    };

    return (
        <div className="space-y-3" data-testid="drafts-panel">
            <div className={`${card} p-3`}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <div className="text-[13px] font-ui text-[hsl(var(--text-1))]">Research Drafts</div>
                        <div className="text-[11px] text-muted-lab font-ui max-w-2xl mt-0.5">
                            State-target research for THIS strategy only. Drafts never run by themselves —
                            applying a Confirmed draft copies it into the Targets tab, visibly.
                        </div>
                        <div className="text-[10px] text-muted-lab font-ui mt-1" title="Strategy signature — drafts are scoped to it">
                            Scope: <span className="text-[hsl(var(--text-2))]">{signature}</span>
                        </div>
                    </div>
                    {(counts.Confirmed || 0) > 0 && (
                        <button type="button" onClick={applyConfirmed} data-testid="apply-confirmed-drafts"
                            className="rounded border border-[hsl(var(--success)/0.5)] px-2 py-1 text-[11px] font-ui text-[hsl(var(--success))]"
                            title="Fold every CONFIRMED research draft into the Targets tab overrides (drafts become Added to Run). The ONLY bridge from research to execution.">
                            Apply {counts.Confirmed} confirmed draft{counts.Confirmed === 1 ? "" : "s"} → Targets
                        </button>
                    )}
                </div>
                <div className="mt-2 flex flex-wrap gap-2 text-[10px] font-ui" data-testid="draft-counts">
                    {[...DRAFT_STATUSES, DRAFT_TERMINAL].map((st) => (
                        <span key={st} className="rounded border px-1.5 py-0.5"
                            style={{ borderColor: `hsl(var(--${STATUS_TONE[st] || "text-3"}))`, color: `hsl(var(--${STATUS_TONE[st] || "text-3"}))` }}>
                            {st}: {counts[st] || 0}
                        </span>
                    ))}
                </div>
            </div>

            {rows.length === 0 ? (
                <div className="text-[11px] font-ui text-muted-lab">
                    No drafts for this strategy yet. Drafts are created from the Run Workspace →
                    Session Results state drilldown, where the native evidence lives.
                </div>
            ) : (
                <div className={`${card} p-2 overflow-x-auto`}>
                    <table className="w-full text-[11px] font-ui">
                        <thead><tr className="text-left text-muted-lab">
                            <th className="pr-3 py-1">Cohort</th><th className="pr-3">State</th>
                            <th className="pr-3">Proposed target</th><th className="pr-3">Status</th><th>Note</th>
                        </tr></thead>
                        <tbody>
                            {rows.map((r) => (
                                <tr key={`${r.cohortKey}-${r.state}`} className="border-t border-[hsl(var(--border-soft))]" data-testid={`draft-row-${r.cohortKey}-${r.state.replace(/\W+/g, "_")}`}>
                                    <td className="pr-3 py-1.5 text-[hsl(var(--text-1))] whitespace-nowrap">{r.cohortKey}</td>
                                    <td className="pr-3 py-1.5"><StateHeader state={r.state} /></td>
                                    <td className="pr-3 py-1.5 text-[hsl(var(--text-2))]">{r.block ? "Block" : r.target != null ? `${r.target}R` : "—"}</td>
                                    <td className="pr-3 py-1.5">
                                        <span className="rounded border px-1.5 py-0.5 text-[10px]"
                                            style={{ borderColor: `hsl(var(--${STATUS_TONE[r.status] || "text-3"}))`, color: `hsl(var(--${STATUS_TONE[r.status] || "text-3"}))` }}>
                                            {r.status}
                                        </span>
                                    </td>
                                    <td className="py-1.5 text-muted-lab">{r.notes || ""}{r.confidence ? ` · ${r.confidence}` : ""}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
