// MarketStateTargetOverrides.jsx — Market State Target Overrides panel
// (STATE-TARGET-POLICY-UI-PLAN-1 §4). Sits directly below Cohort Target Overrides.
//
// Per cohort × market state choose: Inherit Base / Custom RR / Block / Research Only.
// Research Only stores a suggestion in the scenario for provenance but NEVER executes.
// OFF by default (cfg.stateOverridesEnabled) → existing runs stay byte-identical.
//
// Reads/writes ONLY builder cfg fields via onField:
//   stateOverridesEnabled    (panel gate)
//   stateTargetOverrides     ({ [cohortKey]: { [state]: { mode, rr } } })
// plus the SIBLING panel's fields for the per-row Enable/Disable cohort action
// (cohortTargetOverrides.enabled — one shared source of truth, no duplicate state).
//
// PM is never modified here. The panel READS the deployed policy to show each
// cohort's action and to warn when a configured state can never execute because PM
// already blocks that state for this cohort.

import React, { useMemo } from "react";
import policyDoc from "@/data/deployedPolicy.v1.json";
import { loadPolicy } from "@/data/portfolioPolicy";
import { POLICY_LABELS, POLICY_TONE, POLICY_TOOLTIPS } from "@/data/portfolioLabels";
import {
    COHORTS_BY_SESSION, RUN_DEFAULT, normalizeOverrides, globalRunRR, cohortPmAction,
} from "@/data/cohortTargetOverrides";
import {
    STATE_AXIS, MODE_LABELS, TARGET_OPTIONS, normalizeStateOverrides, setCell,
    copyBaseToAllStates, summarizeStateOverrides, buildStateOverrideWarnings,
    pmBlockedStates, builderSignatureParts,
} from "@/data/stateTargetOverrides";
import { applyDraftsToOverrides, draftCounts, buildStrategySignature } from "@/data/statePolicyDrafts";

const card = "rounded-md border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel))]";
const SHORT_STATE = { "Bull/Expand": "B/Exp", "Bull/Compress": "B/Com", "Bull/Chop": "B/Chp", "Bear/Expand": "Be/Exp", "Bear/Compress": "Be/Com", "Bear/Chop": "Be/Chp" };

function Chip({ tone = "text-2", title, children }) {
    return (
        <span title={title}
            className="inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-ui whitespace-nowrap"
            style={{ borderColor: `hsl(var(--${tone}))`, color: `hsl(var(--${tone}))` }}>
            {children}
        </span>
    );
}

const selectCls = "bg-[hsl(var(--panel-2))] border border-[hsl(var(--border-soft))] rounded px-1 py-0.5 text-[10px] font-ui text-[hsl(var(--text-1))]";

function StateCell({ cell, pmBlocksState, onChange, testid }) {
    const tone = cell.mode === "block" ? "danger" : cell.mode === "custom" ? "success" : cell.mode === "research" ? "accent-secondary" : "text-3";
    return (
        <div className={`flex flex-col gap-0.5 ${pmBlocksState && cell.mode !== "inherit" ? "opacity-90" : ""}`} data-testid={testid}>
            <select className={selectCls} style={{ color: `hsl(var(--${tone}))` }} value={cell.mode === "custom" ? "custom" : "inherit"}
                onChange={(e) => onChange({ mode: e.target.value, rr: cell.rr ?? 2.0 })}>
                <option value="inherit">{MODE_LABELS.inherit}</option>
                <option value="custom">{MODE_LABELS.custom}</option>
            </select>
            {(cell.mode === "custom" || cell.mode === "research") && (
                <select className={selectCls} value={cell.rr ?? 2.0}
                    onChange={(e) => onChange({ mode: cell.mode, rr: Number(e.target.value) })}>
                    {TARGET_OPTIONS.map((t) => <option key={t} value={t}>{t}R</option>)}
                </select>
            )}
            {pmBlocksState && (cell.mode === "custom" || cell.mode === "block") && (
                <span className="text-[9px] font-ui text-[hsl(var(--warning))]" title="This state target will never execute because PM blocks this state.">PM blocks</span>
            )}
        </div>
    );
}

export default function MarketStateTargetOverrides({ cfg, onField, instrument = "EURUSD" }) {
    const table = useMemo(() => loadPolicy(policyDoc), []);
    const active = Boolean(cfg?.stateOverridesEnabled);
    const gRR = globalRunRR(cfg);
    const cohortOv = useMemo(() => normalizeOverrides(cfg?.cohortTargetOverrides), [cfg?.cohortTargetOverrides]);
    const stateOv = useMemo(() => normalizeStateOverrides(cfg?.stateTargetOverrides), [cfg?.stateTargetOverrides]);
    const summary = useMemo(() => summarizeStateOverrides(cfg), [cfg]);
    const warnings = useMemo(() => buildStateOverrideWarnings(cfg, table, instrument), [cfg, table, instrument]);
    // Research-universe scope: drafts are read/applied ONLY for THIS builder
    // configuration's strategy signature — never another strategy's research.
    const signature = useMemo(() => buildStrategySignature(builderSignatureParts(cfg)), [cfg]);
    const drafts = draftCounts(signature);

    const baseLabel = (key) => {
        const o = cohortOv[key];
        if (!o.enabled) return "disabled";
        return o.target === RUN_DEFAULT ? `${gRR}R` : `${o.target}R`;
    };

    const applyConfirmedDrafts = () => {
        const { overrides, appliedCount } = applyDraftsToOverrides(signature, cfg?.stateTargetOverrides);
        if (!appliedCount) return;
        onField("stateTargetOverrides", overrides);
        if (!active) onField("stateOverridesEnabled", true);
    };

    return (
        <div className="space-y-3" data-testid="market-state-target-overrides">
            <div className={`${card} p-3`}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <div className="text-[13px] font-ui text-[hsl(var(--text-1))] flex items-center gap-2">
                            Target Policy
                            <Chip tone="warning" title="What target does each ALLOWED trade use? Eligibility (allow/block) lives in Trade Eligibility.">Targets only</Chip>
                        </div>
                        <div className="text-[11px] text-muted-lab font-ui max-w-2xl mt-0.5">
                            One panel for ALL targets: the editable Base target per cohort plus per-state
                            Inherit&nbsp;Base / Custom&nbsp;RR exceptions. Eligibility (Allow/Block) is a separate
                            concern — configure it in Trade Eligibility. Unlabelled / warmup trades always use the
                            cohort base target. Research suggestions live in the draft layer, never here.
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        {(drafts.Confirmed || 0) > 0 && (
                            <button type="button" onClick={applyConfirmedDrafts}
                                className="rounded border border-[hsl(var(--success)/0.5)] px-2 py-1 text-[11px] font-ui text-[hsl(var(--success))]"
                                data-testid="apply-confirmed-drafts"
                                title="Fold every CONFIRMED research draft into these overrides (drafts become Applied). The ONLY bridge from research to execution.">
                                Apply {drafts.Confirmed} confirmed draft{drafts.Confirmed === 1 ? "" : "s"}
                            </button>
                        )}
                        <button type="button" onClick={() => onField("stateOverridesEnabled", !active)}
                            className={`rounded border px-2 py-1 text-[11px] font-ui ${active ? "border-[hsl(var(--success))] text-[hsl(var(--success))]" : "border-[hsl(var(--border-mid))] text-[hsl(var(--text-2))]"}`}
                            data-testid="state-overrides-toggle">
                            {active ? "ON — emitted with the scenario" : "OFF — byte-identical run"}
                        </button>
                    </div>
                </div>

                {/* Pre-launch resolved summary */}
                <div className="mt-2 text-[11px] font-ui text-muted-lab" data-testid="state-overrides-summary">
                    {summary.cohorts} cohorts · {summary.cells} state cells ·{" "}
                    <span className="text-[hsl(var(--text-2))]">{summary.inherit} inherit</span> ·{" "}
                    <span className="text-[hsl(var(--success))]">{summary.custom} custom</span> ·{" "}
                    <span className="text-[hsl(var(--danger))]">{summary.block} blocked</span> ·{" "}
                    <span className="text-[hsl(var(--accent-secondary))]">{summary.research} research only</span>
                    {" · "}PM {cfg?.portfolioEnabled ? "enforce" : "off"} · State policy {active ? "on" : "off"}
                    {warnings.length > 0 && <span className="text-[hsl(var(--warning))]"> · {warnings.length} warning{warnings.length === 1 ? "" : "s"}</span>}
                </div>
                {warnings.slice(0, 4).map((w, i) => (
                    <div key={i} className="mt-1 text-[10.5px] font-ui text-[hsl(var(--warning))]" data-testid="state-override-warning">{w.message}</div>
                ))}
                {warnings.length > 4 && <div className="mt-1 text-[10px] font-ui text-muted-lab">…and {warnings.length - 4} more.</div>}
            </div>

            {active && COHORTS_BY_SESSION.map((grp) => (
                <div key={grp.sessionKey} className={`${card} p-2`}>
                    <div className="text-[11px] font-ui uppercase tracking-wider text-[hsl(var(--accent-secondary))] mb-1.5">{grp.sessionLabel}</div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-[11px] font-ui">
                            <thead>
                                <tr className="text-left text-muted-lab">
                                    <th className="pr-2 py-1">Cohort</th><th className="pr-2">PM</th><th className="pr-2">Base</th>
                                    {STATE_AXIS.map((st) => <th key={st} className="pr-2" title={st}>{SHORT_STATE[st]}</th>)}
                                    <th>Row</th>
                                </tr>
                            </thead>
                            <tbody>
                                {grp.cohorts.map((c) => {
                                    const action = cohortPmAction(table, c, instrument);
                                    const pmBlocked = new Set(cfg?.portfolioEnabled ? pmBlockedStates(action, c.direction) : []);
                                    const enabled = cohortOv[c.key].enabled;
                                    return (
                                        <tr key={c.key} className={`border-t border-[hsl(var(--border-soft))] align-top ${enabled ? "" : "opacity-45"}`} data-testid={`ms-row-${c.key}`}>
                                            <td className="pr-2 py-1.5 text-[hsl(var(--text-1))] whitespace-nowrap">{c.cellLabel}</td>
                                            <td className="pr-2 py-1.5">
                                                {action ? <Chip tone={POLICY_TONE[action]} title={POLICY_TOOLTIPS[action]}>{POLICY_LABELS[action]}</Chip> : <span className="text-muted-lab">—</span>}
                                            </td>
                                            <td className="pr-2 py-1" data-testid={`ms-base-${c.key}`}>
                                                <select className={`${selectCls} text-[hsl(var(--text-1))]`}
                                                    value={cohortOv[c.key].target === RUN_DEFAULT ? "default" : String(cohortOv[c.key].target)}
                                                    onChange={(e) => onField("cohortTargetOverrides", { ...cohortOv, [c.key]: { ...cohortOv[c.key], target: e.target.value === "default" ? RUN_DEFAULT : Number(e.target.value) } })}
                                                    data-testid={`ms-base-select-${c.key}`}>
                                                    <option value="default">Run default ({gRR}R)</option>
                                                    {TARGET_OPTIONS.map((t) => <option key={t} value={t}>{t}R</option>)}
                                                </select>
                                            </td>
                                            {STATE_AXIS.map((st) => (
                                                <td key={st} className="pr-2 py-1">
                                                    <StateCell
                                                        cell={stateOv[c.key][st]}
                                                        pmBlocksState={pmBlocked.has(st)}
                                                        onChange={(cell) => onField("stateTargetOverrides", setCell(cfg?.stateTargetOverrides, c.key, st, cell))}
                                                        testid={`ms-cell-${c.key}-${st.replace(/\W+/g, "_")}`}
                                                    />
                                                </td>
                                            ))}
                                            <td className="py-1.5 whitespace-nowrap">
                                                <button type="button" title="Copy Base to all states (reset every state cell to Inherit Base)"
                                                    className="text-[10px] text-muted-lab underline decoration-dotted mr-2"
                                                    onClick={() => onField("stateTargetOverrides", copyBaseToAllStates(cfg?.stateTargetOverrides, c.key))}
                                                    data-testid={`ms-copybase-${c.key}`}>
                                                    Copy base
                                                </button>
                                                <span className="text-[9px] text-muted-lab" title="Eligibility (Allow/Disable/Rescue/Block) is configured in the Trade Eligibility panel.">elig → Trade Eligibility</span>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            ))}
        </div>
    );
}
