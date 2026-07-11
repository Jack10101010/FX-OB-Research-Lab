// PortfolioManagerControls.jsx — Strategy Builder V2 Portfolio Manager section.
//
// Read-only over the DEPLOYED policy mirror (src/data/deployedPolicy.v1.json). Lets the
// user turn the Portfolio Manager ON/OFF, shows the deployed policy summary, explains the
// four actions with friendly labels, and previews what the policy will block/allow.
//
// It reads/writes ONLY the builder cfg fields via onField:
//   portfolioEnabled  (→ portfolio_policy_enabled)   portfolioMode ("enforce")
// It NEVER edits the policy, NEVER renames a canonical enum, and re-uses the single
// source of truth for friendly labels: @/data/portfolioLabels.

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

export default function PortfolioManagerControls({ cfg, onField, instrument = "EURUSD" }) {
    const table = useMemo(() => loadPolicy(policyDoc), []);
    const on = Boolean(cfg?.portfolioEnabled);
    const includeDisabled = Boolean(cfg?.portfolioIncludeDisabledCohorts);
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
            {/* Toggle + mode + subtitle */}
            <div className={`${card} p-3`}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <div className="text-[13px] font-ui text-[hsl(var(--text-1))]">Portfolio Manager</div>
                        <div className="text-[11px] text-muted-lab font-ui max-w-xl">
                            Use the validated cohort policy to allow/block eligible trades by Session × Structure × Direction.
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        {on && <Chip tone="accent-primary" title="Enforce is the only supported mode: PM blocks disallowed fills.">Mode: Enforce</Chip>}
                        <button
                            type="button"
                            role="switch"
                            aria-checked={on}
                            data-testid="pm-toggle"
                            onClick={() => onField("portfolioEnabled", !on)}
                            className="inline-flex items-center gap-2 rounded border border-[hsl(var(--border-soft))] px-2.5 py-1 text-[11px] font-ui"
                            style={{ color: on ? "hsl(var(--success))" : "hsl(var(--text-2))" }}
                        >
                            <span className="inline-block w-8 h-4 rounded-full relative"
                                style={{ background: on ? "hsl(var(--success)/0.35)" : "hsl(var(--border-mid))" }}>
                                <span className="absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all"
                                    style={{ left: on ? "18px" : "2px" }} />
                            </span>
                            Portfolio Manager {on ? "ON" : "OFF"}
                        </button>
                    </div>
                </div>
            </div>

            {/* Research override: include disabled cohorts.
                HIDDEN from the normal workflow (SB-V2 consolidation): eligibility presets in the
                Trade Eligibility panel replace it ("All Cohorts (Research)" = same population, clearer
                semantics). Rendered only when the legacy flag is ALREADY set on the loaded config, so
                old research configs stay visible/editable and can be switched off — never silently active. */}
            {on && includeDisabled && (
                <div className={`${card} p-3`} data-testid="pm-include-disabled">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                            <div className="text-[12px] font-ui text-[hsl(var(--text-1))] flex items-center gap-2">
                                Include disabled cohorts
                                <Chip tone="warning" title="Research-only run override.">Research</Chip>
                            </div>
                            <div className="text-[11px] text-muted-lab font-ui max-w-xl mt-0.5">
                                Portfolio Manager stays active and applies its normal per-cohort logic — but the{" "}
                                <span className="text-[hsl(var(--text-2))]">{counts.DISABLE}</span>{" "}
                                cohort{counts.DISABLE === 1 ? "" : "s"} currently set to <span className="text-[hsl(var(--danger))]">NEVER TRADE</span>{" "}
                                are treated as <span className="text-[hsl(var(--text-2))]">Always Trade (Label)</span> for this run only.
                                Existing Label / State-only / Direction-aware cohorts are unchanged. The deployed policy and its checksum are not modified.
                            </div>
                        </div>
                        <button
                            type="button"
                            role="switch"
                            aria-checked={includeDisabled}
                            data-testid="pm-include-disabled-toggle"
                            onClick={() => onField("portfolioIncludeDisabledCohorts", !includeDisabled)}
                            className="inline-flex items-center gap-2 rounded border border-[hsl(var(--border-soft))] px-2.5 py-1 text-[11px] font-ui"
                            style={{ color: includeDisabled ? "hsl(var(--warning))" : "hsl(var(--text-2))" }}
                        >
                            <span className="inline-block w-8 h-4 rounded-full relative"
                                style={{ background: includeDisabled ? "hsl(var(--warning)/0.35)" : "hsl(var(--border-mid))" }}>
                                <span className="absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all"
                                    style={{ left: includeDisabled ? "18px" : "2px" }} />
                            </span>
                            {includeDisabled ? "All cohorts ON" : "Deployed (OFF)"}
                        </button>
                    </div>
                    {includeDisabled && (
                        <div className="mt-2 text-[10.5px] font-ui text-[hsl(var(--warning))]" data-testid="pm-include-disabled-note">
                            This run is <span className="font-semibold">PM v1.2 · All cohorts</span> — every cohort participates; no cohort is fully excluded.
                            It is tagged in the run metadata so it cannot be confused with a normal PM v1.2 run.
                        </div>
                    )}
                </div>
            )}

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
                        {counts.DISABLE} cohort{counts.DISABLE === 1 ? "" : "s"} will be blocked entirely (NEVER TRADE).
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

            {!on && (
                <div className="text-[10.5px] font-ui text-muted-lab">
                    Portfolio Manager is OFF for this run — the deployed cohort policy will not filter trades.
                </div>
            )}
        </div>
    );
}
