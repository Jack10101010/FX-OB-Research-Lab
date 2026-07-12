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
import { buildStrategySignature } from "@/data/statePolicyDrafts";
import { StateHeader, resolveCohortEligibility, ResolvedEligibilityCell } from "./stateDisplay";
import { normalizeEligibility, eligibilityForPreset, ELIGIBILITY_PRESETS } from "@/data/eligibilityPolicy";

const card = "rounded-md border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel))]";

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
    // Eligibility cross-annotation (read-only view of the Eligibility tab's policy).
    const eligMap = useMemo(() => {
        if (!cfg?.eligibilityEnabled) return null;
        return (cfg?.eligibilityPreset === ELIGIBILITY_PRESETS.CUSTOM || !cfg?.eligibilityPreset)
            ? normalizeEligibility(cfg?.cohortEligibility)
            : eligibilityForPreset(cfg?.eligibilityPreset, table, instrument);
    }, [cfg?.eligibilityEnabled, cfg?.eligibilityPreset, cfg?.cohortEligibility, table, instrument]);
    const stateAllowed = (cohortKey, st) => {
        if (!eligMap) return true;
        const e = eligMap[cohortKey];
        if (!e) return true;
        if (e.states[st] === "allow") return true;
        if (e.states[st] === "block") return false;
        return e.base === "allow";
    };
    const gRR = globalRunRR(cfg);
    const cohortOv = useMemo(() => normalizeOverrides(cfg?.cohortTargetOverrides), [cfg?.cohortTargetOverrides]);
    const stateOv = useMemo(() => normalizeStateOverrides(cfg?.stateTargetOverrides), [cfg?.stateTargetOverrides]);
    const summary = useMemo(() => summarizeStateOverrides(cfg), [cfg]);
    const warnings = useMemo(() => buildStateOverrideWarnings(cfg, table, instrument), [cfg, table, instrument]);
    // Drafts are managed in the Trade Policy → Drafts tab (signature-scoped there).

    const baseLabel = (key) => {
        const o = cohortOv[key];
        if (!o.enabled) return "disabled";
        return o.target === RUN_DEFAULT ? `${gRR}R` : `${o.target}R`;
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
                        <button type="button" onClick={() => onField("stateOverridesEnabled", !active)}
                            className={`rounded border px-2 py-1 text-[11px] font-ui ${active ? "border-[hsl(var(--success))] text-[hsl(var(--success))]" : "border-[hsl(var(--border-mid))] text-[hsl(var(--text-2))]"}`}
                            data-testid="state-overrides-toggle">
                            {active ? "Policy active — emitted with the scenario" : "Policy off — run unchanged (byte-identical)"}
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
                                    {STATE_AXIS.map((st) => <th key={st} className="pr-2"><StateHeader state={st} /></th>)}
                                    <th>Row</th>
                                </tr>
                            </thead>
                            <tbody>
                                {grp.cohorts.map((c) => {
                                    const action = cohortPmAction(table, c, instrument);
                                    const pmBlocked = new Set(cfg?.portfolioEnabled ? pmBlockedStates(action, c.direction) : []);
                                    const e = eligMap ? eligMap[c.key] : null;
                                    const rowActive = e
                                        ? (e.base === "allow" || Object.values(e.states).includes("allow"))
                                        : cohortOv[c.key].enabled;
                                    const pmMode = cfg?.portfolioEnabled ? (cfg?.portfolioMode === "label" ? "label" : "enforce") : "off";
                                    const resolved = resolveCohortEligibility({
                                        pmAction: action, pmMode,
                                        includeDisabled: Boolean(cfg?.portfolioIncludeDisabledCohorts),
                                        scenarioBase: e ? e.base : (cohortOv[c.key].enabled ? "allow" : "disable"),
                                        rescuedCount: e ? Object.values(e.states).filter((v) => v === "allow" && e.base === "disable").length : 0,
                                        blockedCount: e ? Object.values(e.states).filter((v) => v === "block" && e.base === "allow").length : 0,
                                    });
                                    return (
                                        <tr key={c.key} className={`border-t border-[hsl(var(--border-soft))] align-top ${rowActive ? "" : "opacity-45"}`} data-testid={`ms-row-${c.key}`}>
                                            <td className="pr-2 py-1.5 text-[hsl(var(--text-1))] whitespace-nowrap">{c.cellLabel}</td>
                                            <td className="pr-2 py-1.5" data-testid={`ms-resolved-${c.key}`}>
                                                <ResolvedEligibilityCell resolved={resolved} />
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
                                            {STATE_AXIS.map((st) => {
                                                const allowedByElig = stateAllowed(c.key, st);
                                                return (
                                                    <td key={st} className="pr-2 py-1">
                                                        {allowedByElig ? (
                                                            <StateCell
                                                                cell={stateOv[c.key][st]}
                                                                pmBlocksState={pmBlocked.has(st)}
                                                                onChange={(cell) => onField("stateTargetOverrides", setCell(cfg?.stateTargetOverrides, c.key, st, cell))}
                                                                testid={`ms-cell-${c.key}-${st.replace(/\W+/g, "_")}`}
                                                            />
                                                        ) : (
                                                            <span className="text-[10px] font-ui text-[hsl(var(--text-3))]"
                                                                title="This state is blocked/disabled by the Eligibility tab — a target here can never execute. Change it in Eligibility."
                                                                data-testid={`ms-cell-${c.key}-${st.replace(/\W+/g, "_")}`}>
                                                                🔒 blocked
                                                            </span>
                                                        )}
                                                    </td>
                                                );
                                            })}
                                            <td className="py-1.5 whitespace-nowrap">
                                                <button type="button" title="Copy Base to all states (reset every state cell to Inherit Base)"
                                                    className="text-[10px] text-muted-lab underline decoration-dotted mr-2"
                                                    onClick={() => onField("stateTargetOverrides", copyBaseToAllStates(cfg?.stateTargetOverrides, c.key))}
                                                    data-testid={`ms-copybase-${c.key}`}>
                                                    Copy base
                                                </button>
                                                <span className="text-[9px] text-muted-lab" title="Eligibility (Allow/Disable/Rescue/Block) is configured in the Eligibility tab; 🔒 cells here are blocked there.">elig → Eligibility tab</span>
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
