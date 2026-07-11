// TradeEligibility.jsx — ONE panel answering "which trades are allowed?" (SB-V2).
//
// Consolidates: PM on/off (+ NEW Label/Enforce mode), the old "include disabled
// cohorts" toggle (now an internal research override surfaced only as a note), the
// scattered cohort enable/disable toggles, and the NEW per-state Allow/Block
// eligibility. PM decisions and scenario eligibility stay visibly SEPARATE:
//   PM decision  ≠  Scenario eligibility override.
// A scenario rescue can never bypass PM ENFORCE — the panel warns instead.
//
// cfg fields: portfolioEnabled, portfolioMode ("enforce"|"label"),
//             portfolioIncludeDisabledCohorts (internal/legacy),
//             eligibilityEnabled, eligibilityPreset, cohortEligibility.

import React, { useMemo } from "react";
import policyDoc from "@/data/deployedPolicy.v1.json";
import { loadPolicy } from "@/data/portfolioPolicy";
import { POLICY_LABELS, POLICY_TONE, POLICY_TOOLTIPS } from "@/data/portfolioLabels";
import { COHORTS_BY_SESSION } from "@/data/cohortTargetOverrides";
import { MARKET_STATES } from "@/data/marketState";
import {
    ELIGIBILITY_PRESETS, PRESET_LABELS, STATE_ACTIONS,
    normalizeEligibility, eligibilityForPreset, summarizeEligibility,
} from "@/data/eligibilityPolicy";

const card = "rounded-md border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel))]";
const selectCls = "bg-[hsl(var(--panel-2))] border border-[hsl(var(--border-soft))] rounded px-1 py-0.5 text-[10px] font-ui";
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

export default function TradeEligibility({ cfg, onField, instrument = "EURUSD" }) {
    const table = useMemo(() => loadPolicy(policyDoc), []);
    const pmOn = Boolean(cfg?.portfolioEnabled);
    const pmMode = pmOn ? (cfg?.portfolioMode === "label" ? "label" : "enforce") : "off";
    const preset = cfg?.eligibilityPreset || ELIGIBILITY_PRESETS.DEPLOYED_PM;
    const active = Boolean(cfg?.eligibilityEnabled);
    const elig = useMemo(
        () => (preset === ELIGIBILITY_PRESETS.CUSTOM
            ? normalizeEligibility(cfg?.cohortEligibility)
            : eligibilityForPreset(preset, table, instrument)),
        [preset, cfg?.cohortEligibility, table, instrument],
    );
    const summary = useMemo(() => summarizeEligibility({ ...cfg, eligibilityPreset: preset }, table, instrument), [cfg, preset, table, instrument]);

    const setPmMode = (mode) => {
        if (mode === "off") onField("portfolioEnabled", false);
        else { onField("portfolioEnabled", true); onField("portfolioMode", mode); }
    };
    const setPreset = (p) => {
        onField("eligibilityPreset", p);
        if (p === ELIGIBILITY_PRESETS.CUSTOM && (!cfg?.cohortEligibility || !Object.keys(cfg.cohortEligibility).length)) {
            // Seed custom from the current preset so editing starts from reality.
            onField("cohortEligibility", elig);
        }
    };
    const setCell = (cohortKey, field, value) => {
        const next = normalizeEligibility(cfg?.cohortEligibility && Object.keys(cfg.cohortEligibility).length ? cfg.cohortEligibility : elig);
        if (field === "base") next[cohortKey].base = value;
        else next[cohortKey].states[field] = value;
        onField("cohortEligibility", next);
        if (preset !== ELIGIBILITY_PRESETS.CUSTOM) onField("eligibilityPreset", ELIGIBILITY_PRESETS.CUSTOM);
    };

    return (
        <div className="space-y-3" data-testid="trade-eligibility">
            <div className={`${card} p-3 space-y-2`}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <div className="text-[13px] font-ui text-[hsl(var(--text-1))]">Trade Eligibility</div>
                        <div className="text-[11px] text-muted-lab font-ui max-w-2xl mt-0.5">
                            Which trades are allowed. Two SEPARATE layers, in engine order:
                            <span className="text-[hsl(var(--text-2))]"> PM decision</span> (runs first, never bypassed) ≠
                            <span className="text-[hsl(var(--text-2))]"> scenario eligibility override</span> (base allow/disable
                            + per-state Allow that can rescue an exact state inside a disabled cohort, or Block one inside an
                            enabled cohort). Unlabelled trades always use the cohort base.
                        </div>
                    </div>
                </div>

                {/* PM mode — one control, three honest modes */}
                <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[10px] font-ui uppercase tracking-wider text-[hsl(var(--accent-secondary))]">Portfolio Manager</span>
                    {["off", "label", "enforce"].map((m) => (
                        <button key={m} type="button" onClick={() => setPmMode(m)} data-testid={`pm-mode-${m}`}
                            className={`rounded border px-2 py-1 text-[11px] font-ui capitalize ${pmMode === m ? "border-[hsl(var(--accent-primary))] text-[hsl(var(--accent-primary))]" : "border-[hsl(var(--border-mid))] text-[hsl(var(--text-2))]"}`}
                            title={m === "off" ? "PM disabled — no decisions stamped, nothing blocked."
                                : m === "label" ? "Stamp every candidate's deployed PM decision WITHOUT blocking — complete research populations."
                                : "The deployed gate: STATE_ONLY / DIRECTION_AWARE / DISABLE cohorts are actually blocked."}>
                            {m}
                        </button>
                    ))}
                    {summary.includeDisabled && pmMode === "enforce" && (
                        <Chip tone="warning" title="Legacy research override (portfolio_include_disabled_cohorts): PM-DISABLE cohorts run as LABEL for this run only. Kept for compatibility; prefer eligibility presets.">
                            research override: include-disabled ON
                        </Chip>
                    )}
                </div>

                {/* Eligibility preset */}
                <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[10px] font-ui uppercase tracking-wider text-[hsl(var(--accent-secondary))]">Eligibility preset</span>
                    {Object.values(ELIGIBILITY_PRESETS).map((p) => (
                        <button key={p} type="button" onClick={() => setPreset(p)} data-testid={`elig-preset-${p}`}
                            className={`rounded border px-2 py-1 text-[11px] font-ui ${preset === p ? "border-[hsl(var(--success))] text-[hsl(var(--success))]" : "border-[hsl(var(--border-mid))] text-[hsl(var(--text-2))]"}`}>
                            {PRESET_LABELS[p]}
                        </button>
                    ))}
                    <button type="button" onClick={() => onField("eligibilityEnabled", !active)} data-testid="eligibility-toggle"
                        className={`ml-auto rounded border px-2 py-1 text-[11px] font-ui ${active ? "border-[hsl(var(--success))] text-[hsl(var(--success))]" : "border-[hsl(var(--border-mid))] text-[hsl(var(--text-2))]"}`}>
                        {active ? "ON — emitted with the scenario" : "OFF — byte-identical run"}
                    </button>
                </div>

                {/* Resolved summary — nobody has to remember what PM disables */}
                <div className="text-[11px] font-ui text-muted-lab" data-testid="eligibility-summary">
                    <span className="text-[hsl(var(--text-2))]">{summary.enabledBases}</span> cohort bases enabled ·{" "}
                    <span className={summary.disabledBases ? "text-[hsl(var(--danger))]" : ""}>{summary.disabledBases}</span> disabled ·{" "}
                    <span className={summary.stateRescues ? "text-[hsl(var(--success))]" : ""}>{summary.stateRescues}</span> state rescues ·{" "}
                    <span className={summary.stateBlocks ? "text-[hsl(var(--warning))]" : ""}>{summary.stateBlocks}</span> state blocks ·{" "}
                    PM {pmMode} — deployed PM disables{" "}
                    <span className="text-[hsl(var(--warning))]" title={summary.pmDisabledCohorts.join(", ") || "none"}>{summary.pmDisabledCohorts.length} cohorts</span>{" "}
                    and state-filters <span title={summary.stateFilteredCohorts.join(", ") || "none"}>{summary.stateFilteredCohorts.length}</span>
                    {summary.warnings.length > 0 && <span className="text-[hsl(var(--warning))]"> · {summary.warnings.length} warning{summary.warnings.length === 1 ? "" : "s"}</span>}
                </div>
                {summary.warnings.slice(0, 4).map((w, i) => (
                    <div key={i} className="text-[10.5px] font-ui text-[hsl(var(--warning))]" data-testid="eligibility-warning">{w.message}</div>
                ))}
            </div>

            {/* Custom editor — 24 cohorts × base + 6 states, PM action always visible */}
            {active && preset === ELIGIBILITY_PRESETS.CUSTOM && COHORTS_BY_SESSION.map((grp) => (
                <div key={grp.sessionKey} className={`${card} p-2`}>
                    <div className="text-[11px] font-ui uppercase tracking-wider text-[hsl(var(--accent-secondary))] mb-1.5">{grp.sessionLabel}</div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-[11px] font-ui">
                            <thead><tr className="text-left text-muted-lab">
                                <th className="pr-2 py-1">Cohort</th><th className="pr-2">PM decision</th><th className="pr-2">Base</th>
                                {MARKET_STATES.map((st) => <th key={st} className="pr-2" title={st}>{SHORT_STATE[st]}</th>)}
                                <th>Effective</th>
                            </tr></thead>
                            <tbody>
                                {grp.cohorts.map((c) => {
                                    const row = summary.rows.find((r) => r.key === c.key);
                                    const e = elig[c.key];
                                    return (
                                        <tr key={c.key} className={`border-t border-[hsl(var(--border-soft))] align-top ${e.base === "disable" && !row.rescued.length ? "opacity-50" : ""}`} data-testid={`elig-row-${c.key}`}>
                                            <td className="pr-2 py-1.5 whitespace-nowrap text-[hsl(var(--text-1))]">{c.cellLabel}</td>
                                            <td className="pr-2 py-1.5">
                                                {row.pmAction ? <Chip tone={POLICY_TONE[row.pmAction]} title={POLICY_TOOLTIPS[row.pmAction]}>{POLICY_LABELS[row.pmAction]}</Chip> : "—"}
                                            </td>
                                            <td className="pr-2 py-1">
                                                <select className={`${selectCls} ${e.base === "disable" ? "text-[hsl(var(--danger))]" : "text-[hsl(var(--success))]"}`}
                                                    value={e.base} data-testid={`elig-base-${c.key}`}
                                                    onChange={(ev) => setCell(c.key, "base", ev.target.value)}>
                                                    <option value="allow">Allow</option>
                                                    <option value="disable">Disable</option>
                                                </select>
                                            </td>
                                            {MARKET_STATES.map((st) => {
                                                const v = e.states[st];
                                                const pmBlocks = row.pmBlocked.includes(st);
                                                return (
                                                    <td key={st} className="pr-2 py-1">
                                                        <select className={`${selectCls} ${v === "allow" ? "text-[hsl(var(--success))]" : v === "block" ? "text-[hsl(var(--danger))]" : "text-[hsl(var(--text-3))]"}`}
                                                            value={v} data-testid={`elig-cell-${c.key}-${st.replace(/\W+/g, "_")}`}
                                                            onChange={(ev) => setCell(c.key, st, ev.target.value)}>
                                                            {STATE_ACTIONS.map((a) => <option key={a} value={a}>{a === "inherit" ? "Inherit" : a === "allow" ? "Allow" : "Block"}</option>)}
                                                        </select>
                                                        {pmBlocks && v === "allow" && (
                                                            <div className="text-[8.5px] font-ui text-[hsl(var(--warning))]" title="Rescued by the scenario, but PM ENFORCE still blocks this state — the rescue cannot execute.">PM blocks</div>
                                                        )}
                                                    </td>
                                                );
                                            })}
                                            <td className="py-1.5 text-[10px] text-muted-lab whitespace-nowrap" data-testid={`elig-effective-${c.key}`}>
                                                {e.base === "allow" ? "enabled" : "disabled"}
                                                {row.rescued.length > 0 && <span className="text-[hsl(var(--success))]"> +{row.rescued.length} rescued</span>}
                                                {row.blocked.length > 0 && <span className="text-[hsl(var(--warning))]"> −{row.blocked.length} blocked</span>}
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
