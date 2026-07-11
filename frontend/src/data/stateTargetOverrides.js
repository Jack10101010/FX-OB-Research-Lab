// stateTargetOverrides.js — Market State Target Overrides (STATE-TARGET-POLICY-UI-PLAN-1).
//
// PURE model + serializer for the "Market State Target Overrides" Strategy Builder
// panel: per cohort × market state, choose Inherit Base / Custom RR / Block /
// Research Only. Extends the EXISTING session_strategy_scenario cohort rules with an
// optional `state_overrides` key — never a parallel execution path, never a PM class.
//
// SEPARATION OF CONCERNS (do not blur):
//   • Portfolio Manager decides WHETHER a trade is allowed (runs FIRST in the engine).
//   • State Target Policy decides WHAT TARGET an allowed trade receives (or a state
//     block) — it runs AFTER PM and AFTER the cohort enable/disable gate.
//   • Research Only rides in the scenario for provenance but NEVER executes.
//   • Unlabelled / warmup / unconfirmed states ALWAYS inherit the cohort base target;
//     labels are never invented (engine enforces the same rule).
//
// Gate discipline: cfg.stateOverridesEnabled OFF (default) ⇒ mergeStateOverrides…
// returns the base scenario UNCHANGED ⇒ existing runs stay byte-identical.
//
// REUSES (never duplicates): COHORTS axis + TARGET_OPTIONS ladder + PM lookup from
// cohortTargetOverrides.js; canonical states from marketState.js; PM per-state rule
// semantics mirrored from portfolioLabels.POLICY_STATE_RULES.

import { COHORTS, TARGET_OPTIONS, snapTarget, cohortPmAction } from "./cohortTargetOverrides";
import { MARKET_STATES } from "./marketState";

export const STATE_AXIS = Object.freeze([...MARKET_STATES]); // 6 canonical states
export const STATE_MODES = Object.freeze(["inherit", "custom", "block", "research"]);
export const MODE_LABELS = Object.freeze({
    inherit: "Inherit Base",
    custom: "Custom RR",
    block: "Block",
    research: "Research Only",
});
export { TARGET_OPTIONS };

// ── Normalization ──────────────────────────────────────────────────────────────
/** One cell → {mode, rr|null}. Unknown mode ⇒ inherit; custom snaps to the ladder. */
export function normalizeCell(raw) {
    const mode = STATE_MODES.includes(raw?.mode) ? raw.mode : "inherit";
    let rr = null;
    if (mode === "custom" || mode === "research") {
        const n = Number(raw?.rr);
        rr = Number.isFinite(n) && n > 0 ? snapTarget(n) : (mode === "custom" ? null : rr);
    }
    // A custom cell without a valid rr degrades to inherit (never emits garbage).
    if (mode === "custom" && rr == null) return { mode: "inherit", rr: null };
    return { mode, rr };
}

/** Full 24×6 map: {cohortKey: {state: {mode, rr}}} — every cohort/state present. */
export function normalizeStateOverrides(raw) {
    const src = raw && typeof raw === "object" ? raw : {};
    const out = {};
    for (const c of COHORTS) {
        const row = src[c.key] && typeof src[c.key] === "object" ? src[c.key] : {};
        out[c.key] = {};
        for (const st of STATE_AXIS) out[c.key][st] = normalizeCell(row[st]);
    }
    return out;
}

// ── Row operations (Strategy Builder row actions) ──────────────────────────────
export function copyBaseToAllStates(overrides, cohortKey) {
    const next = normalizeStateOverrides(overrides);
    for (const st of STATE_AXIS) next[cohortKey][st] = { mode: "inherit", rr: null };
    return next;
}
export const resetCohortStates = copyBaseToAllStates; // identical semantics (all → inherit)

export function setCell(overrides, cohortKey, state, cell) {
    const next = normalizeStateOverrides(overrides);
    if (STATE_AXIS.includes(state)) next[cohortKey][state] = normalizeCell(cell);
    return next;
}

// ── Strategy signature from BUILDER cfg (canonical backend forms) ───────────────
// Mirrors configTranslator's mappings so the Builder's signature matches the one
// SessionResults derives from a completed run's config + resolved universe.
const _TF_MAP = { M1: "1min", M5: "5min", M15: "15min", M30: "30min", H1: "1h", H4: "4h" };
const _EXEC_MAP = { multi_position: "allow_multi_position", single_position: "single_position", one_per_direction: "one_per_direction" };
export function builderSignatureParts(cfg) {
    const model = cfg?.entryModel || "baseline";
    const thr = Array.isArray(cfg?.singleTriggeredEdgeThresholds) && cfg.singleTriggeredEdgeThresholds.length
        ? Number(cfg.singleTriggeredEdgeThresholds[0])
        : (cfg?.singleTriggeredEdgeThreshold != null ? Number(cfg.singleTriggeredEdgeThreshold) : null);
    const delayN = Array.isArray(cfg?.triggeredEdgeDelays) && cfg.triggeredEdgeDelays.length
        ? Number(cfg.triggeredEdgeDelays[0]) : null;
    const isTe = model === "triggered_edge";
    return {
        instrument: cfg?.symbol || "EURUSD",
        detectionTf: _TF_MAP[cfg?.detectionTf] || cfg?.detectionTf || "15min",
        family: model,
        threshold: isTe ? thr : (model === "penetration" || model === "entry_penetration" ? thr : null),
        delay: isTe && Number.isFinite(delayN) ? `d${delayN}` : null,
        variant: _EXEC_MAP[cfg?.executionMode] || cfg?.executionMode || "allow_multi_position",
    };
}

// ── PM conflict analysis (read-only; PM is never modified here) ────────────────
/** States the deployed PM action would block for this cohort direction.
 *  STATE_ONLY blocks both chop states; DIRECTION_AWARE blocks counter-trend states
 *  (Short blocked in Bull trend states, Long blocked in Bear trend states; chop open).
 *  Mirrors portfolioLabels.POLICY_STATE_RULES / the engine's _portfolio_regime_gate. */
export function pmBlockedStates(action, direction) {
    if (action === "STATE_ONLY") return ["Bull/Chop", "Bear/Chop"];
    if (action === "DIRECTION_AWARE") {
        return direction === "Short"
            ? ["Bull/Expand", "Bull/Compress"]
            : ["Bear/Expand", "Bear/Compress"];
    }
    if (action === "DISABLE") return [...STATE_AXIS];
    return [];
}

// ── Serialization: merge into the EXISTING scenario (additive) ────────────────
/**
 * Merge the panel's state overrides into a base session_strategy_scenario produced by
 * buildSessionStrategyScenario. Returns the base UNCHANGED (same reference) when the
 * panel is OFF or there is nothing to emit — byte-identical discipline.
 *
 * EXECUTION CONFIG CONTAINS ONLY EXECUTABLE BEHAVIOUR: inherit (implicit, never
 * serialized), custom, block. "Research Only" cells are a PANEL-LOCAL visual bookmark
 * and are NOT serialized — research metadata (suggested targets, confidence, notes,
 * lifecycle) lives exclusively in the scoped draft layer (statePolicyDrafts). The
 * backend additionally drops any legacy "research" keys defensively, so old saved
 * configs remain harmless. Disabled cohorts never carry state_overrides.
 */
export function mergeStateOverridesIntoScenario(baseScenario, cfg) {
    if (!cfg || !cfg.stateOverridesEnabled) return baseScenario;
    if (!baseScenario || baseScenario.enabled !== true || !Array.isArray(baseScenario.cohorts)) return baseScenario;
    const ov = normalizeStateOverrides(cfg.stateTargetOverrides);
    const byKey = new Map(COHORTS.map((c) => [`${c.sessionKey}|${c.structure}|${c.direction}`, c.key]));
    let emitted = 0;
    const cohorts = baseScenario.cohorts.map((row) => {
        if (row.enabled === false) return row;
        const cohortKey = byKey.get(`${row.session}|${row.structure}|${row.direction}`);
        if (!cohortKey) return row;
        const cells = ov[cohortKey];
        const so = {};
        for (const st of STATE_AXIS) {
            const cell = cells[st];
            // Only EXECUTABLE cells serialize; "research" is panel-local provenance.
            if (cell.mode === "block") so[st] = { mode: "block" };
            else if (cell.mode === "custom") so[st] = { mode: "custom", rr: cell.rr };
        }
        if (!Object.keys(so).length) return row;
        emitted += 1;
        return { ...row, state_overrides: so };
    });
    if (!emitted) return baseScenario;
    const summary = summarizeStateOverrides(cfg);
    return {
        ...baseScenario,
        cohorts,
        meta: {
            ...(baseScenario.meta || {}),
            state_overrides_schema: 1,
            state_cells_custom: summary.custom,
            state_cells_block: summary.block,
            state_cells_research: summary.research,
        },
    };
}

/** Reverse-parse a scenario's state_overrides back into panel state (reload). */
export function stateOverridesFromScenario(scenario) {
    if (!scenario || scenario.enabled !== true || !Array.isArray(scenario.cohorts)) {
        return { enabled: false, overrides: {} };
    }
    const byKey = new Map(COHORTS.map((c) => [`${c.sessionKey}|${c.structure}|${c.direction}`, c.key]));
    const overrides = {};
    let any = false;
    for (const row of scenario.cohorts) {
        const cohortKey = byKey.get(`${row.session}|${row.structure}|${row.direction}`);
        const so = row && typeof row.state_overrides === "object" ? row.state_overrides : null;
        if (!cohortKey || !so) continue;
        overrides[cohortKey] = {};
        for (const st of STATE_AXIS) {
            if (so[st] && typeof so[st] === "object") {
                overrides[cohortKey][st] = normalizeCell(so[st]);
                any = true;
            }
        }
    }
    return { enabled: any, overrides: normalizeStateOverrides(overrides) };
}

// ── Pre-launch resolved summary + warnings ─────────────────────────────────────
export function summarizeStateOverrides(cfg) {
    const ov = normalizeStateOverrides(cfg?.stateTargetOverrides);
    let inherit = 0, custom = 0, block = 0, research = 0;
    for (const c of COHORTS) for (const st of STATE_AXIS) {
        const m = ov[c.key][st].mode;
        if (m === "custom") custom += 1;
        else if (m === "block") block += 1;
        else if (m === "research") research += 1;
        else inherit += 1;
    }
    return { cohorts: COHORTS.length, cells: COHORTS.length * STATE_AXIS.length, inherit, custom, block, research };
}

/**
 * Advisory warnings (never block launch): a configured cell (custom/block) in a state
 * the deployed PM would already block can never execute — "This state target will
 * never execute because PM blocks this state."
 */
export function buildStateOverrideWarnings(cfg, policyTable, instrument = "EURUSD") {
    if (!cfg || !cfg.stateOverridesEnabled) return [];
    const pmOn = Boolean(cfg.portfolioEnabled);
    if (!pmOn || !policyTable) return [];
    const ov = normalizeStateOverrides(cfg.stateTargetOverrides);
    const warnings = [];
    for (const c of COHORTS) {
        const action = cohortPmAction(policyTable, c, instrument);
        const blocked = new Set(pmBlockedStates(action, c.direction));
        if (!blocked.size) continue;
        for (const st of STATE_AXIS) {
            const cell = ov[c.key][st];
            if ((cell.mode === "custom" || cell.mode === "block") && blocked.has(st)) {
                warnings.push({
                    type: "pm_blocks_state",
                    cohort: c.key,
                    state: st,
                    message: `${c.sessionLabel} ${c.cellLabel} · ${st}: this state ${cell.mode === "block" ? "block" : `target ${cell.rr}R`} will never execute because PM ${action} blocks this state.`,
                });
            }
        }
    }
    return warnings;
}
