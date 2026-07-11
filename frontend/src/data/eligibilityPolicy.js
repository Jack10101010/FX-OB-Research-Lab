// eligibilityPolicy.js — Cohort × Market-State ELIGIBILITY (SB-V2 consolidation).
//
// Answers ONE question — "which trades are allowed?" — separately from PM (which
// decides at its own, earlier gate) and separately from Target Policy (which only
// decides what target an allowed trade uses).
//
// Model (cfg fields, all OFF by default ⇒ byte-identical emission):
//   eligibilityEnabled  : panel gate
//   eligibilityPreset   : "deployed_pm" | "all_research" | "custom"
//   cohortEligibility   : { [cohortKey]: { base: "allow"|"disable",
//                                          states: { [state]: "inherit"|"allow"|"block" } } }
//
// Scenario emission (schema v2, additive): per cohort
//   eligibility: { base, states:{state: allow|block} }   (inherit never serialized)
//   enabled: base === "allow"                            (legacy mirror for old readers)
// A state-level ALLOW rescues an exact state inside a disabled cohort; a state-level
// BLOCK disables an exact state inside an enabled one. Unlabelled/unconfirmed always
// use the BASE eligibility (engine-enforced). PM runs BEFORE all of this and is never
// bypassed by a rescue — the panel warns instead.
//
// The old "Include disabled cohorts" flag (PM DISABLE→LABEL, PM-layer) is kept
// INTERNALLY for compatibility but is no longer a primary control; the presets +
// explicit warnings replace it.

import { COHORTS } from "./cohortTargetOverrides";
import { MARKET_STATES } from "./marketState";
import { pmBlockedStates } from "./stateTargetOverrides";
import { lookupCohort } from "./portfolioPolicy";

export const ELIGIBILITY_PRESETS = Object.freeze({
    DEPLOYED_PM: "deployed_pm",
    ALL_RESEARCH: "all_research",
    CUSTOM: "custom",
});
export const PRESET_LABELS = Object.freeze({
    deployed_pm: "Deployed Portfolio Manager",
    all_research: "All Cohorts Research",
    custom: "Custom Cohort / State Eligibility",
});
export const BASE_ACTIONS = Object.freeze(["allow", "disable"]);
export const STATE_ACTIONS = Object.freeze(["inherit", "allow", "block"]);

const pmActionOf = (table, c, instrument) => {
    const row = table ? lookupCohort(table, instrument, c.sessionKey, c.structure, c.direction) : null;
    return row ? row.policy : null;
};

/** Full 24-cohort eligibility map. Missing entries default to base allow + inherit. */
export function normalizeEligibility(raw) {
    const src = raw && typeof raw === "object" ? raw : {};
    const out = {};
    for (const c of COHORTS) {
        const e = src[c.key] && typeof src[c.key] === "object" ? src[c.key] : {};
        const base = e.base === "disable" ? "disable" : "allow";
        const states = {};
        for (const st of MARKET_STATES) {
            const v = e.states && e.states[st];
            states[st] = STATE_ACTIONS.includes(v) ? v : "inherit";
        }
        out[c.key] = { base, states };
    }
    return out;
}

/** Preset expansion. deployed_pm mirrors the DEPLOYED book: PM-DISABLE cohorts get
 *  base "disable" (visible, not remembered); everything else "allow". */
export function eligibilityForPreset(preset, policyTable, instrument = "EURUSD") {
    const out = {};
    for (const c of COHORTS) {
        const action = pmActionOf(policyTable, c, instrument);
        const base = preset === ELIGIBILITY_PRESETS.DEPLOYED_PM && action === "DISABLE" ? "disable" : "allow";
        out[c.key] = { base, states: Object.fromEntries(MARKET_STATES.map((st) => [st, "inherit"])) };
    }
    return normalizeEligibility(out);
}

/** Merge eligibility into the scenario (schema v2). OFF / all-default ⇒ base scenario
 *  returned UNCHANGED (same reference — byte-identical discipline). */
export function mergeEligibilityIntoScenario(baseScenario, cfg, policyTable = null, instrument = "EURUSD") {
    if (!cfg || !cfg.eligibilityEnabled) return baseScenario;
    if (!baseScenario || baseScenario.enabled !== true || !Array.isArray(baseScenario.cohorts)) return baseScenario;
    const preset = cfg.eligibilityPreset || ELIGIBILITY_PRESETS.CUSTOM;
    const elig = preset === ELIGIBILITY_PRESETS.CUSTOM
        ? normalizeEligibility(cfg.cohortEligibility)
        : eligibilityForPreset(preset, policyTable, instrument);
    const byKey = new Map(COHORTS.map((c) => [`${c.sessionKey}|${c.structure}|${c.direction}`, c.key]));
    let rescues = 0, blocks = 0, disabled = 0;
    const cohorts = baseScenario.cohorts.map((row) => {
        const cohortKey = byKey.get(`${row.session}|${row.structure}|${row.direction}`);
        if (!cohortKey) return row;
        const e = elig[cohortKey];
        const states = {};
        for (const st of MARKET_STATES) {
            if (e.states[st] === "allow" && e.base === "disable") { states[st] = "allow"; rescues += 1; }
            else if (e.states[st] === "block" && e.base === "allow") { states[st] = "block"; blocks += 1; }
            // allow-inside-allowed / block-inside-disabled are no-ops — not serialized.
        }
        if (e.base === "disable") disabled += 1;
        const next = { ...row, enabled: e.base === "allow" };            // legacy mirror
        // State targets are meaningless in a fully-disabled cohort — but a RESCUED state
        // still executes and MUST keep its custom target (combined-smoke bug fix: this
        // previously deleted state_overrides even when a rescue existed, silently
        // reverting the rescued fill to the base RR).
        const hasRescue = Object.values(states).includes("allow");
        if (e.base === "disable" && !hasRescue && next.target) delete next.state_overrides;
        next.eligibility = { base: e.base, ...(Object.keys(states).length ? { states } : {}) };
        return next;
    });
    return {
        ...baseScenario,
        cohorts,
        meta: {
            ...(baseScenario.meta || {}),
            eligibility_schema: 1,
            eligibility_preset: preset,
            eligibility_disabled_bases: disabled,
            eligibility_state_rescues: rescues,
            eligibility_state_blocks: blocks,
        },
    };
}

/** Reverse-parse (reload). Reads eligibility keys; falls back to legacy enabled. */
export function eligibilityFromScenario(scenario) {
    if (!scenario || scenario.enabled !== true || !Array.isArray(scenario.cohorts)) {
        return { enabled: false, preset: null, eligibility: {} };
    }
    const byKey = new Map(COHORTS.map((c) => [`${c.sessionKey}|${c.structure}|${c.direction}`, c.key]));
    const eligibility = {};
    let any = false;
    for (const row of scenario.cohorts) {
        const cohortKey = byKey.get(`${row.session}|${row.structure}|${row.direction}`);
        if (!cohortKey) continue;
        const e = row.eligibility && typeof row.eligibility === "object" ? row.eligibility : null;
        if (e) {
            any = true;
            eligibility[cohortKey] = { base: e.base === "disable" ? "disable" : "allow", states: { ...(e.states || {}) } };
        } else if (row.enabled === false) {
            eligibility[cohortKey] = { base: "disable", states: {} };
        }
    }
    return {
        enabled: any,
        preset: (scenario.meta && scenario.meta.eligibility_preset) || (any ? ELIGIBILITY_PRESETS.CUSTOM : null),
        eligibility: normalizeEligibility(eligibility),
    };
}

/**
 * Resolved summary + warnings for the panel / Resolved Run Summary. Pure.
 * Shows what the deployed PM disables (nobody has to remember it), scenario bases,
 * rescues/blocks, and PM-conflict warnings ("rescued but PM ENFORCE still blocks").
 */
export function summarizeEligibility(cfg, policyTable, instrument = "EURUSD") {
    const preset = cfg?.eligibilityPreset || ELIGIBILITY_PRESETS.CUSTOM;
    const active = Boolean(cfg?.eligibilityEnabled);
    const elig = preset === ELIGIBILITY_PRESETS.CUSTOM
        ? normalizeEligibility(cfg?.cohortEligibility)
        : eligibilityForPreset(preset, policyTable, instrument);
    const pmMode = cfg?.portfolioEnabled ? (cfg?.portfolioMode === "label" ? "label" : "enforce") : "off";
    const rows = COHORTS.map((c) => {
        const action = pmActionOf(policyTable, c, instrument);
        const e = elig[c.key];
        const rescued = MARKET_STATES.filter((st) => e.base === "disable" && e.states[st] === "allow");
        const blocked = MARKET_STATES.filter((st) => e.base === "allow" && e.states[st] === "block");
        const pmBlocked = pmMode === "enforce" ? pmBlockedStates(action, c.direction) : [];
        return { key: c.key, sessionLabel: c.sessionLabel, cellLabel: c.cellLabel, pmAction: action,
                 base: e.base, rescued, blocked, pmBlocked };
    });
    const pmDisabledCohorts = rows.filter((r) => r.pmAction === "DISABLE").map((r) => r.key);
    const stateFilteredCohorts = rows.filter((r) => r.pmAction === "STATE_ONLY" || r.pmAction === "DIRECTION_AWARE").map((r) => r.key);
    const warnings = [];
    for (const r of rows) {
        for (const st of r.rescued) {
            if (r.pmBlocked.includes(st)) {
                warnings.push({ type: "pm_blocks_rescued_state", cohort: r.key, state: st,
                    message: `${r.sessionLabel} ${r.cellLabel} · ${st}: rescued by the scenario, but PM ENFORCE still blocks this state — the rescue cannot execute.` });
            }
            if (pmMode === "enforce" && r.pmAction === "DISABLE" && !cfg?.portfolioIncludeDisabledCohorts) {
                warnings.push({ type: "pm_disable_blocks_rescue", cohort: r.key, state: st,
                    message: `${r.sessionLabel} ${r.cellLabel} · ${st}: rescued by the scenario, but the deployed PM DISABLES this cohort under ENFORCE — no candidate reaches the scenario (research override required).` });
            }
        }
    }
    // De-dupe repeated pm_disable warnings per cohort.
    const seen = new Set();
    const dedup = warnings.filter((w) => {
        const k = `${w.type}|${w.cohort}|${w.state || ""}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
    });
    return {
        active, preset, pmMode,
        enabledBases: rows.filter((r) => r.base === "allow").length,
        disabledBases: rows.filter((r) => r.base === "disable").length,
        stateRescues: rows.reduce((n, r) => n + r.rescued.length, 0),
        stateBlocks: rows.reduce((n, r) => n + r.blocked.length, 0),
        pmDisabledCohorts, stateFilteredCohorts,
        includeDisabled: Boolean(cfg?.portfolioIncludeDisabledCohorts),
        rows, warnings: dedup,
    };
}
