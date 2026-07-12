// PortfolioManagerControls.jsx — "Deployed Policy Reference" (SB-V2 UX polish).
//
// PURE DOCUMENTATION, collapsed by default. Read-only over the DEPLOYED policy mirror
// (src/data/deployedPolicy.v1.json): policy version + checksum, what the PM does, the
// four actions with friendly labels, and the "What this policy will do" preview.
//
// It contains NO active controls. The ONE Portfolio Manager control (Enabled + Mode
// Off/Label/Enforce) lives in the Trade Policy → Eligibility tab; the include-disabled
// research override lives in Advanced Research / Legacy. This panel never edits the
// policy and never renames a canonical enum (labels come from @/data/portfolioLabels).

import React, { useMemo, useState } from "react";
import policyDoc from "@/data/deployedPolicy.v1.json";
import { loadPolicy } from "@/data/portfolioPolicy";
import {
    POLICY_LABELS, POLICY_TOOLTIPS, POLICY_TONE,
    effectiveNetR, beforePMNetR,
} from "@/data/portfolioLabels";

const ACTION_ORDER = ["DIRECTION_AWARE", "STATE_ONLY", "LABEL", "DISABLE"];
const MS_DEPENDENCY = {
    LABEL: "Market State not consulted.",
    STATE_ONLY: "Consults Market State — blocks Bull/Chop and Bear/Chop.",
    DIRECTION_AWARE: "Consults Market State — trend side only (both directions in chop).",
    DISABLE: "Market State not consulted — always blocked.",
};

function Chip({ tone, title, children }) {
    return (
        <span title={title}
            className="inline-flex items-center rounded border px-1.5 py-0.5 text-[10.5px] font-ui whitespace-nowrap"
            style={{ borderColor: `hsl(var(--${tone}))`, color: `hsl(var(--${tone}))` }}>
            {children}
        </span>
    );
}

function RCell({ v, bold }) {
    if (v == null) return <span className="text-muted-lab">—</span>;
    const tone = v > 0 ? "success" : v < 0 ? "danger" : "text-2";
    return <span className={bold ? "font-semibold" : ""} style={{ color: `hsl(var(--${tone}))` }}>{v > 0 ? "+" : ""}{v.toFixed(2)}</span>;
}

export default function PortfolioManagerControls({ cfg, instrument = "EURUSD", defaultOpen = false }) {
    const table = useMemo(() => loadPolicy(policyDoc), []);
    const on = Boolean(cfg?.portfolioEnabled);
    const includeDisabled = Boolean(cfg?.portfolioIncludeDisabledCohorts);
    const [open, setOpen] = useState(defaultOpen);
    const [showList, setShowList] = useState(false);

    // deployed-policy summary
    const instruments = useMemo(
        () => Array.from(new Set(table.cohorts.map((c) => c.instrument))).sort(),
        [table]);
    const instCohorts = useMemo(
        () => table.cohorts.filter((c) => c.instrument === instrument),
        [table, instrument]);
    const counts = useMemo(() => {
        const by = { LABEL: 0, STATE_ONLY: 0, DIRECTION_AWARE: 0, DISABLE: 0 };
        for (const c of instCohorts) if (by[c.policy] != null) by[c.policy] += 1;
        return by;
    }, [instCohorts]);
    // PM v1.1 is a research-validated candidate; it is only "live" if the deployed mirror
    // actually carries the New York CHoCH Short → DIRECTION_AWARE change.
    const v11Deployed = useMemo(() => {
        const c = table.byKey.get("EURUSD|newYork|choch_short");
        return !!c && c.policy === "DIRECTION_AWARE";
    }, [table]);
    const shortSha = (table.policySha256 || "").slice(0, 12);

    const grouped = useMemo(() => {
        const g = {};
        for (const c of instCohorts) (g[c.policy] = g[c.policy] || []).push(c);
        return g;
    }, [instCohorts]);

    const card = "rounded-md border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel))]";
    const kicker = "text-[10px] text-muted-lab font-ui";

    return (
        <div className="space-y-3" data-testid="pm-controls">
            {/* Documentation header — single disclosure control, no active PM controls here. */}
            <button type="button" onClick={() => setOpen((v) => !v)} data-testid="pm-docs-toggle"
                className={`${card} w-full p-3 flex items-center justify-between text-left`}>
                <div>
                    <div className="text-[13px] font-ui text-[hsl(var(--text-1))]">Deployed Policy Reference</div>
                    <div className="text-[11px] text-muted-lab font-ui">
                        Documentation: what the deployed Portfolio Manager policy is and what it will do.
                        The PM on/off + mode control is in the Eligibility tab.
                    </div>
                </div>
                <span className="text-[11px] font-ui text-[hsl(var(--text-2))]">{open ? "▴ Hide" : "▾ Show"}</span>
            </button>
            {open && (<>
            {/* Deployed policy summary */}
            <div className={`${card} p-3`}>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                    <div><div className={kicker}>Deployed policy</div><div className="text-[12px] text-[hsl(var(--text-1))] font-ui">{table.policyVersion}</div></div>
                    <div><div className={kicker}>Checksum</div><div className="text-[12px] text-[hsl(var(--text-2))] font-ui">{shortSha || "—"}</div></div>
                    <div><div className={kicker}>Instruments</div><div className="text-[12px] text-[hsl(var(--text-2))] font-ui">{instruments.join(", ")}</div></div>
                    <div className="ml-auto flex items-center gap-2">
                        {ACTION_ORDER.map((p) => (
                            <Chip key={p} tone={POLICY_TONE[p]} title={`${p} — ${POLICY_TOOLTIPS[p]}`}>{POLICY_LABELS[p]} · {counts[p]}</Chip>
                        ))}
                    </div>
                </div>
                <div className="mt-2 text-[10.5px] font-ui text-muted-lab">
                    {v11Deployed
                        ? "Current deployed policy includes the PM v1.1 New York CHoCH Short change."
                        : <>Current deployed policy: <span className="text-[hsl(var(--text-2))]">PM v1</span>. <span className="text-[hsl(var(--warning))]">PM v1.1 candidate is research-validated but not yet deployed.</span></>}
                </div>
            </div>

            {/* What PM does + four action chips */}
            <div className={`${card} p-3`}>
                <div className="text-[11px] font-ui text-[hsl(var(--accent-primary))] mb-1.5">What the Portfolio Manager does</div>
                <ol className="text-[11px] text-[hsl(var(--text-2))] font-ui leading-relaxed list-none space-y-0.5">
                    <li>Base strategy finds setups.</li>
                    <li>Triggered Entry controls eligibility.</li>
                    <li>PM checks the trade’s predefined cohort and looks up its stored action.</li>
                    <li>It consults Market State only if the action requires it.</li>
                    <li>Then it keeps or blocks the trade.</li>
                </ol>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 mt-2.5">
                    {ACTION_ORDER.map((p) => (
                        <div key={p} className="rounded border border-[hsl(var(--border-soft))] p-2">
                            <Chip tone={POLICY_TONE[p]}>{POLICY_LABELS[p]}</Chip>
                            <div className="text-[9.5px] text-muted-lab font-ui mt-1">{p}</div>
                            <div className="text-[10px] text-[hsl(var(--text-2))] font-ui mt-1 leading-snug">{POLICY_TOOLTIPS[p]}</div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Policy preview */}
            <div className={`${card} p-3`}>
                <div className="flex items-center justify-between">
                    <div className="text-[11px] font-ui text-[hsl(var(--accent-primary))]">What this policy will do · {instrument}</div>
                    <button type="button" onClick={() => setShowList((v) => !v)}
                        className="text-[10.5px] text-muted-lab hover:text-white font-ui" data-testid="pm-preview-toggle">
                        {showList ? "Hide cohort list ▲" : "Show full cohort list ▼"}
                    </button>
                </div>
                <div className="flex flex-wrap items-center gap-2 mt-1.5 text-[11px] font-ui">
                    <span className="text-[hsl(var(--text-1))]">{instCohorts.length} cohorts</span>
                    {ACTION_ORDER.map((p) => (
                        <span key={p} className="text-muted-lab">·
                            <span style={{ color: `hsl(var(--${POLICY_TONE[p]}))` }}> {counts[p]}</span> {POLICY_LABELS[p]}
                        </span>
                    ))}
                    <span className="ml-auto text-[10px] text-muted-lab">
                        {includeDisabled && on
                            ? <>{counts.DISABLE} NEVER TRADE cohort{counts.DISABLE === 1 ? "" : "s"} <span className="text-[hsl(var(--warning))]">run as Label this run (research override)</span>.</>
                            : <>{counts.DISABLE} cohort{counts.DISABLE === 1 ? "" : "s"} will be blocked entirely (NEVER TRADE).</>}
                    </span>
                </div>

                {showList && (
                    <div className="mt-2 space-y-2" data-testid="pm-cohort-list">
                        {ACTION_ORDER.filter((p) => (grouped[p] || []).length).map((p) => (
                            <div key={p} className="rounded border border-[hsl(var(--border-soft))]">
                                <div className="flex items-center justify-between px-2 py-1 border-b border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2))]">
                                    <span className="inline-flex items-center gap-2">
                                        <Chip tone={POLICY_TONE[p]}>{POLICY_LABELS[p]}</Chip>
                                        <span className="text-[9.5px] text-muted-lab font-ui">{p}</span>
                                    </span>
                                    <span className="text-[9.5px] text-muted-lab font-ui">{MS_DEPENDENCY[p]}</span>
                                </div>
                                <table className="min-w-full border-collapse">
                                    <thead>
                                        <tr className="text-[9px] text-muted-lab font-ui">
                                            <th className="text-left px-2 py-1">Session</th>
                                            <th className="text-left px-2 py-1">Structure</th>
                                            <th className="text-left px-2 py-1">Direction</th>
                                            <th className="text-right px-2 py-1">N</th>
                                            <th className="text-right px-2 py-1">Before PM</th>
                                            <th className="text-right px-2 py-1">{p === "DISABLE" ? "Kept" : "Kept (after PM)"}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {(grouped[p] || []).map((c) => (
                                            <tr key={c.cohortKey} className="text-[10.5px] font-ui text-[hsl(var(--text-1))] border-t border-[hsl(var(--border-soft)/0.5)]">
                                                <td className="px-2 py-1">{c.session}</td>
                                                <td className="px-2 py-1">{c.structure}</td>
                                                <td className="px-2 py-1">{c.direction}</td>
                                                <td className="px-2 py-1 text-right">{c.sampleSize ?? "—"}</td>
                                                <td className="px-2 py-1 text-right"><RCell v={beforePMNetR(c)} /></td>
                                                <td className="px-2 py-1 text-right">
                                                    {p === "DISABLE"
                                                        ? <span className="text-[hsl(var(--danger))]" title="Blocked — no active book">blocked</span>
                                                        : <RCell v={effectiveNetR(c)} bold />}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ))}
                        <div className="text-[9.5px] text-muted-lab font-ui">
                            “Before PM” = the always-allow (label) book; “Kept” = the book under the cohort’s assigned action.
                            Read-only mirror of the deployed policy; PF / Max DD are per-run metrics shown in the Runs view.
                        </div>
                    </div>
                )}
            </div>

            {includeDisabled && on && (
                <div className="text-[10.5px] font-ui text-[hsl(var(--warning))]" data-testid="pm-include-disabled-note">
                    Research override active: NEVER TRADE cohorts run as Always Allow (Label) for this run only —
                    managed in Advanced Research / Legacy.
                </div>
            )}
            </>)}
        </div>
    );
}
