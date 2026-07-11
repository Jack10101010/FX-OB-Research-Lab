// cohortTargetOverrides.js — Phase 1 per-cohort custom targets (Run Workspace).
//
// PURE, dependency-light model + serializer for the "Cohort Target Overrides"
// research panel. It lets the user, from the normal Run Workspace, ENABLE/DISABLE
// each of the 24 EURUSD cohorts individually and pick a custom take-profit target
// per enabled cohort — then submit the EXISTING backend `session_strategy_scenario`
// structure (NOT a parallel execution path, NOT a hard-coded research book).
//
// HARD CONSTRAINTS (do not violate):
//   • Emits the SAME structure the backend already consumes: { enabled:true,
//     cohorts:[24] }, each { session, structure, direction, target:{rr} } (enabled)
//     or { session, structure, direction, enabled:false } (disabled). This is the
//     exact shape that ran natively and composed with PM v1.2.
//   • Custom targets DO NOT bypass PM. PM enforcement (LABEL/STATE_ONLY/
//     DIRECTION_AWARE/DISABLE) runs FIRST in the engine; the scenario only disables a
//     cohort or applies its target to candidates PM already let through. This module
//     never touches PM; it only READS the deployed policy to render action indicators
//     and warnings.
//   • No localStorage, no React, no store state, no mutation of inputs.
//   • Phase 1 ONLY: no per-market-state targets, no state-specific enable rules.
//
// The panel is GATED on cfg.cohortOverridesEnabled. When OFF the serializer returns
// null → buildBacktesterConfig emits no scenario → the run is byte-identical to a
// normal run (same discipline as buildPortfolioConfig / regime_* / target_set).

import { SESSIONS, CELLS } from "./cohortKeys";
import { lookupCohort } from "./portfolioPolicy";

// ── Canonical 24-cohort axis (6 sessions × 4 cells), fixed order ───────────────
// Grouped by session for the UI: London, London Lull, New York, NY PM, Asia, Outside.
export const COHORTS = SESSIONS.flatMap((s) =>
    CELLS.map((c) => ({
        key: `${s.key}|${c.key}`,       // e.g. "newYork|choch_short"
        sessionKey: s.key,
        sessionLabel: s.label,
        cellKey: c.key,
        cellLabel: c.label,             // e.g. "CHoCH Short"
        structure: c.structure,         // "BOS" | "CHoCH"
        direction: c.direction,         // "Long" | "Short"
    })),
);

export const COHORT_KEYS = COHORTS.map((c) => c.key);

// Cohorts grouped by session (for section rendering), preserving canonical order.
export const COHORTS_BY_SESSION = SESSIONS.map((s) => ({
    sessionKey: s.key,
    sessionLabel: s.label,
    cohorts: COHORTS.filter((c) => c.sessionKey === s.key),
}));

// ── Canonical target options ───────────────────────────────────────────────────
// 0.5, 0.6, 0.7, 0.8, 0.9, 1.0, then 0.25 increments through 5.0.
export const TARGET_OPTIONS = (() => {
    const low = [0.5, 0.6, 0.7, 0.8, 0.9, 1.0];
    const hi = [];
    for (let v = 1.25; v <= 5.0 + 1e-9; v += 0.25) hi.push(Number(v.toFixed(2)));
    return [...low, ...hi];
})();

// Sentinel target meaning "inherit the run's global RR (rr_multiple)". Resolved to a
// concrete rr at serialize time. Lets "All enabled at run default" avoid pinning a
// number that would drift if the user changes the global RR.
export const RUN_DEFAULT = "default";

/** Global RR the run will use when a cohort target is RUN_DEFAULT. Mirrors
 *  buildBacktesterConfig's `rr_multiple: Number(cfg.rr) || 3.3`. */
export function globalRunRR(cfg) {
    const v = Number(cfg?.rr);
    return Number.isFinite(v) && v > 0 ? v : 3.3;
}

// ── The frozen 24-cohort FINAL base-target candidate (12 enabled + 12 disabled) ─
// Source: pm_base_target_lock_study `_book_final_fullhist.json`. Enabled cohorts map
// to their locked target; every OTHER cohort is disabled. This is a data mirror used
// to reproduce the candidate from the UI — the execution path is still the generic
// session_strategy_scenario, never a hard-coded book.
export const FINAL_CANDIDATE_TARGETS = Object.freeze({
    "london|bos_long": 1.0,
    "london|choch_short": 2.0,
    "lull|bos_short": 3.25,
    "lull|choch_short": 1.0,
    "newYork|bos_short": 1.0,
    "newYork|choch_short": 2.0,
    "ny_pm|choch_short": 1.0,
    "asia|bos_short": 0.9,
    "asia|choch_short": 0.8,
    "outside|bos_long": 1.25,
    "outside|choch_long": 0.5,
    "outside|choch_short": 2.0,
});

export const FINAL_CANDIDATE_ENABLED_KEYS = Object.keys(FINAL_CANDIDATE_TARGETS);

// ── Preset identifiers ─────────────────────────────────────────────────────────
export const PRESETS = {
    ALL_RUN_DEFAULT: "all_enabled_run_default",
    ALL_RR2: "all_enabled_rr2",
    RESET: "reset_all_overrides",
    FINAL_CANDIDATE: "final_base_target_candidate",
    SAME_ENABLED_RR2: "same_enabled_cohorts_rr2",
};

export const PRESET_LABELS = {
    [PRESETS.ALL_RUN_DEFAULT]: "All enabled at run default",
    [PRESETS.ALL_RR2]: "All enabled at RR2",
    [PRESETS.RESET]: "Reset all overrides",
    [PRESETS.FINAL_CANDIDATE]: "Load final base-target candidate",
    [PRESETS.SAME_ENABLED_RR2]: "Same enabled cohorts, all RR2",
};

// ── Normalization ──────────────────────────────────────────────────────────────
/**
 * Ensure a full 24-entry override map with {enabled:boolean, target:number|RUN_DEFAULT}.
 * Unknown/missing cohorts default to {enabled:true, target:RUN_DEFAULT} (== normal run).
 * Targets are snapped to the nearest canonical option; a disabled cohort keeps its last
 * target (spec: "preserving the last value is fine").
 */
export function normalizeOverrides(raw) {
    const src = (raw && typeof raw === "object") ? raw : {};
    const out = {};
    for (const c of COHORTS) {
        const e = src[c.key] || {};
        const enabled = e.enabled === undefined ? true : Boolean(e.enabled);
        let target = e.target;
        if (target !== RUN_DEFAULT) {
            const n = Number(target);
            target = Number.isFinite(n) ? snapTarget(n) : RUN_DEFAULT;
        }
        out[c.key] = { enabled, target };
    }
    return out;
}

/** Snap an arbitrary numeric target to the nearest canonical TARGET_OPTIONS value. */
export function snapTarget(n) {
    let best = TARGET_OPTIONS[0];
    let bestD = Infinity;
    for (const t of TARGET_OPTIONS) {
        const d = Math.abs(t - n);
        if (d < bestD) { bestD = d; best = t; }
    }
    return best;
}

// ── Presets ────────────────────────────────────────────────────────────────────
/**
 * Compute the {enabled, overrides} state a preset produces. `enabled` is the panel
 * gate (cfg.cohortOverridesEnabled); RESET turns the panel OFF and clears overrides.
 */
export function applyPreset(name) {
    if (name === PRESETS.RESET) {
        return { enabled: false, overrides: {}, preset: null };
    }
    const overrides = {};
    for (const c of COHORTS) {
        switch (name) {
            case PRESETS.ALL_RUN_DEFAULT:
                overrides[c.key] = { enabled: true, target: RUN_DEFAULT };
                break;
            case PRESETS.ALL_RR2:
                overrides[c.key] = { enabled: true, target: 2.0 };
                break;
            case PRESETS.FINAL_CANDIDATE: {
                const t = FINAL_CANDIDATE_TARGETS[c.key];
                overrides[c.key] = t === undefined
                    ? { enabled: false, target: RUN_DEFAULT }
                    : { enabled: true, target: t };
                break;
            }
            case PRESETS.SAME_ENABLED_RR2: {
                const on = FINAL_CANDIDATE_TARGETS[c.key] !== undefined;
                overrides[c.key] = on
                    ? { enabled: true, target: 2.0 }
                    : { enabled: false, target: RUN_DEFAULT };
                break;
            }
            default:
                overrides[c.key] = { enabled: true, target: RUN_DEFAULT };
        }
    }
    return { enabled: true, overrides, preset: name };
}

// ── PM action lookup (read-only; never modifies PM) ────────────────────────────
/** PM action for a cohort ∈ {LABEL, STATE_ONLY, DIRECTION_AWARE, DISABLE} or null. */
export function cohortPmAction(policyTable, cohort, instrument = "EURUSD") {
    if (!policyTable) return null;
    const row = lookupCohort(policyTable, instrument, cohort.sessionKey, cohort.structure, cohort.direction);
    return row ? row.policy : null;
}

/** PM may still block SOME states/directions for this cohort (STATE_ONLY or
 *  DIRECTION_AWARE). Used to warn when a custom target is set on such a cohort. */
export function pmBlockCapable(action) {
    return action === "STATE_ONLY" || action === "DIRECTION_AWARE";
}

/** PM would DISABLE this cohort outright (only reachable if include-disabled override
 *  flips it to LABEL for the run). */
export function pmWouldDisable(action) {
    return action === "DISABLE";
}

// ── Serializer → EXISTING backend session_strategy_scenario ────────────────────
/**
 * Build the backend-ready session_strategy_scenario from cfg. Returns null when the
 * panel is OFF (→ no emission → normal run). Emits ALL 24 cohorts explicitly:
 *   enabled  → { session, structure, direction, target:{ rr } }
 *   disabled → { session, structure, direction, enabled:false }
 * plus an additive `meta` block (engine-ignored) carrying provenance.
 */
export function buildSessionStrategyScenario(cfg) {
    if (!cfg || !cfg.cohortOverridesEnabled) return null;
    const gRR = globalRunRR(cfg);
    const ov = normalizeOverrides(cfg.cohortTargetOverrides);
    let enabledCount = 0;
    let customTargetCount = 0;
    const cohorts = COHORTS.map((c) => {
        const o = ov[c.key];
        const base = { session: c.sessionKey, structure: c.structure, direction: c.direction };
        if (!o.enabled) return { ...base, enabled: false };
        enabledCount += 1;
        const rr = o.target === RUN_DEFAULT ? gRR : Number(o.target);
        if (o.target !== RUN_DEFAULT && Number(o.target) !== gRR) customTargetCount += 1;
        return { ...base, target: { rr } };
    });
    return {
        enabled: true,
        cohorts,
        meta: {
            schema_version: 1,
            preset: cfg.cohortOverridesPreset || null,
            enabled_count: enabledCount,
            disabled_count: cohorts.length - enabledCount,
            custom_target_count: customTargetCount,
            global_run_rr: gRR,
        },
    };
}

// ── Reverse serializer (reload / persistence round-trip) ───────────────────────
/**
 * Reconstruct the panel state from a persisted/imported `session_strategy_scenario`.
 * Returns { enabled, overrides, preset } suitable for patching cfg on reload. A cohort
 * whose scenario rr equals the run's global RR is restored as RUN_DEFAULT (so the panel
 * shows "run default" rather than a pinned number); any other rr is a custom target.
 * Absent/disabled scenario → panel OFF.
 */
export function overridesFromScenario(scenario, { globalRR = 3.3 } = {}) {
    if (!scenario || scenario.enabled !== true || !Array.isArray(scenario.cohorts)) {
        return { enabled: false, overrides: {}, preset: null };
    }
    // Index incoming cohorts by canonical key.
    const cellOf = {};
    for (const c of CELLS) cellOf[`${c.structure}|${c.direction}`] = c.key;
    const incoming = new Map();
    for (const row of scenario.cohorts) {
        const cellKey = cellOf[`${row.structure}|${row.direction}`];
        if (!cellKey) continue;
        incoming.set(`${row.session}|${cellKey}`, row);
    }
    const overrides = {};
    for (const c of COHORTS) {
        const row = incoming.get(c.key);
        if (!row || row.enabled === false || !row.target) {
            overrides[c.key] = { enabled: false, target: RUN_DEFAULT };
            continue;
        }
        const rr = Number(row.target.rr);
        overrides[c.key] = {
            enabled: true,
            target: Number.isFinite(rr) && rr !== globalRR ? snapTarget(rr) : RUN_DEFAULT,
        };
    }
    const preset = scenario.meta && scenario.meta.preset ? scenario.meta.preset : null;
    return { enabled: true, overrides, preset };
}

// ── Run summary (pre-launch) + warnings ────────────────────────────────────────
/**
 * Compose the pre-launch run summary the UI shows before submit. Pure — takes cfg, the
 * loaded PM policy table, and instrument. Warnings are advisory (never block launch).
 */
export function buildRunSummary(cfg, policyTable, instrument = "EURUSD") {
    const active = Boolean(cfg?.cohortOverridesEnabled);
    const gRR = globalRunRR(cfg);
    const ov = normalizeOverrides(cfg?.cohortTargetOverrides);
    const pmOn = Boolean(cfg?.portfolioEnabled);
    const includeDisabled = Boolean(cfg?.portfolioIncludeDisabledCohorts);

    const rows = COHORTS.map((c) => {
        const o = ov[c.key];
        const action = pmOn ? cohortPmAction(policyTable, c, instrument) : null;
        const rr = o.target === RUN_DEFAULT ? gRR : Number(o.target);
        return {
            key: c.key,
            sessionKey: c.sessionKey,
            sessionLabel: c.sessionLabel,
            cellLabel: c.cellLabel,
            structure: c.structure,
            direction: c.direction,
            enabled: o.enabled,
            targetRR: o.enabled ? rr : null,
            isCustom: o.enabled && o.target !== RUN_DEFAULT && Number(o.target) !== gRR,
            isRunDefault: o.target === RUN_DEFAULT,
            pmAction: action,
            pmBlockCapable: pmBlockCapable(action),
            pmWouldDisable: pmWouldDisable(action),
        };
    });

    const enabledCount = rows.filter((r) => r.enabled).length;
    const customTargetCount = rows.filter((r) => r.isCustom).length;

    // STATE_ONLY / DIRECTION_AWARE filtering remains active whenever PM is ON and any
    // enabled cohort carries one of those actions (i.e. not silently downgraded).
    const stateFilteringActive = pmOn && rows.some(
        (r) => r.enabled && (r.pmAction === "STATE_ONLY" || r.pmAction === "DIRECTION_AWARE"),
    );

    const warnings = [];
    for (const r of rows) {
        if (!r.enabled) continue;
        // Enabled via include-disabled override but PM would normally DISABLE it.
        if (pmOn && r.pmWouldDisable) {
            warnings.push({
                type: includeDisabled ? "enabled_over_pm_disable" : "enabled_but_pm_disables",
                cohort: r.key,
                message: includeDisabled
                    ? `${r.sessionLabel} ${r.cellLabel}: PM would normally DISABLE this cohort — it runs only because "Include disabled cohorts" is ON for this run.`
                    : `${r.sessionLabel} ${r.cellLabel}: PM DISABLES this cohort, so it will produce no trades regardless of the target (enable "Include disabled cohorts" to force it).`,
            });
        }
        // Custom target on a cohort PM may still partially block.
        if (pmOn && r.isCustom && r.pmBlockCapable) {
            warnings.push({
                type: "custom_target_pm_may_block",
                cohort: r.key,
                message: `${r.sessionLabel} ${r.cellLabel}: custom target ${r.targetRR}R applies only to candidates PM lets through — PM ${r.pmAction} may still block some states/directions.`,
            });
        }
    }

    return {
        active,
        pmMode: pmOn ? "enforce" : "off",
        pmPolicyVersion: policyTable?.policyVersion || null,
        pmPolicySha256: policyTable?.policySha256 || null,
        includeDisabled,
        enabledCount,
        disabledCount: rows.length - enabledCount,
        customTargetCount,
        globalRunRR: gRR,
        stateFilteringActive,
        preset: cfg?.cohortOverridesPreset || null,
        rows,
        warnings,
    };
}
