// BestValidatedConfig.jsx — "Validated Configurations" (SB-V2 UX polish, visual-review
// fix #2/#3). Renders at the TOP of the Trade Policy section — always visible, never
// buried after long tables.
//
// TWO honest reference configurations from src/data/validatedConfigs.v1.json:
//   A. Highest Full-History Native Return — custom cohort base targets, +131.25R
//      (run 3fd23fa4…; cohort targets verified 1:1 against the run artifact and
//      sourced from the SAME data mirror the presets use: FINAL_CANDIDATE_TARGETS).
//   B. Stable Deployed PM Baseline — PM v1.2 blanket RR2, +93.21R (run f4dc44a2…).
// Plus the regime caveat: blanket RR2 outperformed custom targets in 2025+, so A is
// the highest HISTORICAL result, not necessarily the best current-regime policy.
//
// Informational, not editable. Each "Apply" copies exactly the documented apply_patch
// (plus, for A, the cohort target map built from FINAL_CANDIDATE_TARGETS) into the
// builder via onApply — no hidden mutations, nothing launched.

import React, { useMemo, useState } from "react";
import CONFIGS from "@/data/validatedConfigs.v1.json";
import policyDoc from "@/data/deployedPolicy.v1.json";
import { loadPolicy } from "@/data/portfolioPolicy";
import {
    COHORTS, RUN_DEFAULT, FINAL_CANDIDATE_TARGETS,
} from "@/data/cohortTargetOverrides";
import PolicyGroupsSummary from "./PolicyGroupsSummary";

const card = "rounded-md border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel))]";

/** The 24-cohort override map for config A, from the SAME frozen mirror the presets
 *  use — 12 enabled with their locked targets, everything else disabled. */
export function finalCandidateOverrides() {
    const out = {};
    for (const c of COHORTS) {
        const t = FINAL_CANDIDATE_TARGETS[c.key];
        out[c.key] = t != null ? { enabled: true, target: t } : { enabled: false, target: RUN_DEFAULT };
    }
    return out;
}

/** Full builder patch for one validated config (id: highest_native | stable_deployed). */
export function applyPatchFor(entry) {
    const patch = { ...entry.apply_patch };
    if (entry.apply_targets_source === "FINAL_CANDIDATE_TARGETS") {
        patch.cohortTargetOverrides = finalCandidateOverrides();
    }
    return patch;
}

const Stat = ({ k, v, tone }) => (
    <div className="rounded border border-[hsl(var(--border-soft))] px-2.5 py-1.5">
        <div className="text-[9.5px] font-ui uppercase tracking-wider text-muted-lab">{k}</div>
        <div className="text-[13px] font-ui" style={tone ? { color: `hsl(var(--${tone}))` } : undefined}>{v}</div>
    </div>
);
const Row = ({ k, v }) => (
    <div className="flex items-baseline justify-between gap-3 border-b border-[hsl(var(--border-soft)/0.4)] py-1">
        <span className="text-[10.5px] font-ui text-muted-lab">{k}</span>
        <span className="text-[11.5px] font-ui text-[hsl(var(--text-1))] text-right">{v}</span>
    </div>
);

function ConfigCard({ entry, instrument, onApply }) {
    const [open, setOpen] = useState(false);
    const table = useMemo(() => loadPolicy(policyDoc), []);
    const c = entry.config; const s = entry.stats;
    const headline = [
        `+${s.native_net_r}R`,
        `${s.max_drawdown_r}R DD`,
        `${s.win_rate_pct}% WR`,
        `PF ${s.profit_factor}`,
        `${s.trades_executed}T`,
    ];
    const targetsA = entry.apply_targets_source === "FINAL_CANDIDATE_TARGETS" ? FINAL_CANDIDATE_TARGETS : null;
    return (
        <div className={`${card} overflow-hidden`} data-testid={`validated-config-${entry.id}`}>
            <div className="p-2.5 flex flex-wrap items-center gap-2">
                <span className="rounded border px-1.5 py-0.5 text-[9.5px] font-ui whitespace-nowrap"
                    style={{ borderColor: `hsl(var(--${entry.tone}))`, color: `hsl(var(--${entry.tone}))` }}>
                    {entry.badge}
                </span>
                <span className="text-[12px] font-ui text-[hsl(var(--text-1))]">{entry.name}</span>
                <span className="text-[11px] font-ui text-muted-lab">
                    {headline.map((h, i) => (
                        <span key={i}>{i > 0 && " · "}<span className={i === 0 ? "text-[hsl(var(--success))]" : ""}>{h}</span></span>
                    ))}
                </span>
                <span className="ml-auto flex items-center gap-2">
                    <button type="button" onClick={() => setOpen((v) => !v)} data-testid={`validated-config-details-${entry.id}`}
                        className="text-[10.5px] font-ui text-muted-lab hover:text-white">{open ? "▴ Details" : "▾ Details"}</button>
                    {onApply && (
                        <button type="button" data-testid={`apply-config-${entry.id}`}
                            onClick={() => onApply(applyPatchFor(entry))}
                            title={`Copies exactly these fields into the builder: ${Object.keys(entry.apply_patch).join(", ")}${targetsA ? " + cohortTargetOverrides (12 locked targets, 12 disabled)" : ""}. Dates and candle file untouched. Nothing is launched.`}
                            className="rounded border border-[hsl(var(--accent-primary))] px-2.5 py-1 text-[11px] font-ui text-[hsl(var(--accent-primary))] hover:bg-[hsl(var(--accent-primary)/0.12)]">
                            Apply
                        </button>
                    )}
                </span>
            </div>
            {open && (
                <div className="px-3 pb-3 space-y-3 border-t border-[hsl(var(--border-soft)/0.5)] pt-2">
                    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
                        <Stat k="Native Net R" v={`+${s.native_net_r}R`} tone="success" />
                        <Stat k="Max Drawdown" v={`${s.max_drawdown_r}R`} tone="danger" />
                        <Stat k="Win Rate" v={`${s.win_rate_pct}%`} />
                        <Stat k="Profit Factor" v={s.profit_factor} />
                        <Stat k="W / L / NewsFlat" v={`${s.wins} / ${s.losses} / ${s.news_flattened ?? 0}`} />
                        <Stat k="Max Losing Streak" v={s.max_losing_streak ?? "—"} />
                        <Stat k="Date Validated" v={entry.validated_on} />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
                        <div>
                            <Row k="Strategy" v={c.strategy} />
                            <Row k="Entry Model" v={`${c.entry_model} ${c.threshold_pct}% · C${c.arm_delay}`} />
                            <Row k="Position Mode" v={c.position_mode} />
                            <Row k="Timeframes" v={`${c.detection_tf} → ${c.execution_tf}`} />
                        </div>
                        <div>
                            <Row k="PM Mode" v={c.pm_mode} />
                            <Row k="Eligibility" v={c.eligibility_preset} />
                            <Row k="Base targets" v={c.base_targets} />
                            <Row k="History" v={`${s.first_fill} → ${s.last_fill}`} />
                        </div>
                    </div>
                    {targetsA && (
                        <div>
                            <div className="text-[10px] font-ui uppercase tracking-wider text-[hsl(var(--accent-secondary))] mb-1">
                                Locked cohort targets (12 enabled — every other cohort disabled)
                            </div>
                            <div className="flex flex-wrap gap-1.5" data-testid="final-candidate-targets">
                                {Object.entries(targetsA).map(([k, rr]) => (
                                    <span key={k} className="rounded border border-[hsl(var(--border-mid))] px-1.5 py-0.5 text-[10px] font-ui text-[hsl(var(--text-2))]">
                                        {k} → <span className="text-[hsl(var(--text-1))]">{rr}R</span>
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}
                    {entry.id === "stable_deployed" && (
                        <PolicyGroupsSummary table={table} instrument={instrument} policyVersion={entry.policy_version}
                            note="Cohort groups from the deployed policy mirror (matches this run's stamped policy)." />
                    )}
                    <div className="text-[10px] font-ui text-muted-lab">
                        Source: run <span className="text-[hsl(var(--text-2))]">{entry.source_run}</span>. {entry.source_note}
                    </div>
                </div>
            )}
        </div>
    );
}

export default function BestValidatedConfig({ instrument = "EURUSD", onApply }) {
    return (
        <div className="space-y-2" data-testid="best-validated-config">
            <div className="flex items-baseline gap-2">
                <span className="text-[11px] font-ui uppercase tracking-wider text-[hsl(var(--accent-secondary))]">Validated Configurations</span>
                <span className="text-[10px] font-ui text-muted-lab">known-good references · informational, not editable</span>
            </div>
            {CONFIGS.configs.map((entry) => (
                <ConfigCard key={entry.id} entry={entry} instrument={instrument} onApply={onApply} />
            ))}
            <div className="text-[10.5px] font-ui text-[hsl(var(--warning))]" data-testid="validated-configs-caveat">
                ⚠ {CONFIGS.caveat}
            </div>
        </div>
    );
}
