// sessionScenarioConfig.js — Session-First Strategy compiler (4-Layer P1).
//
// The replacement for scenarioCompile.js. A PURE, FLAT compiler: it turns the
// session-first builder's run-scoped selection (Session Layer + Cohort Layer +
// Fair-Baseline Layer) into the backend-ready blocks:
//
//   { session_strategy_scenario: { version, enabled, global_default, cohorts[24], warnings },
//     baseline_comparison:       { enabled, mode, entry, target, be, risk_reduction, eligible_cohort_keys } }
//
// FLAT MODEL ONLY (vs the retired profile system):
//   • No named-profile registry, no entry/be/target REFS.
//   • No multi-level inheritance chain, no resolveCohortConfig, no normalizeProfiles.
//   • A single, explicit "cohort value, else the run Global Default" resolution.
//   • Emits the EXACT `session_strategy_scenario` schema the backend already reads
//     (per-cohort enabled/entry/target/be execute today; risk_reduction is additive),
//     reusing the proven compileEntry/compileBe/compileTarget output shapes.
//
// PURE: no React, no store, no localStorage, no overlay, no mutation. Imports only
// the neutral cohort primitives (cohortKeys.js). The Detection Layer is accepted but
// NOT emitted here — the run substrate (pair/dates/TFs/swing/OB/news) is merged into
// the submit payload by the Strategy Builder (P5), so this compiler stays focused on
// the scenario + baseline blocks. What it returns IS the payload (preview == payload).
//
// ── Input shape ───────────────────────────────────────────────────────────────
//   {
//     enabled: boolean,                       // session_strategy_scenario.enabled
//     globalDefault: {                        // optional per-run defaults (flat; not a ref)
//       target?: { value }, be?: { trigger, armR }, riskReduction?: RiskRdn, riskAmount?: number
//     } | null,
//     sessions: {                             // Session Layer + Cohort Layer
//       [sessionKey]: {
//         enabled?: boolean,                  // default true
//         setups: {                           // the cohorts this session trades
//           [cellKey]: { enabled?: boolean, target?: { value },
//                        be?: { trigger, armR }, riskReduction?: RiskRdn,
//                        riskAmount?: number, exec?: ExecOverrides }
//         }
//       }
//     },
//     baseline: {                             // Fair Baseline Layer
//       enabled?: boolean, mode?: "eligible" | "whole_run",
//       target?: { value }, be?: { trigger, armR }, riskReduction?: RiskRdn
//     } | null,
//     detection?: object                       // RESERVED — merged by the payload builder (P5); unused here
//   }
//   RiskRdn  = { kind:"move_stop", atR, toR } | { kind:"partial_close", atR, fraction } | null
//
// V1 NOTE: ENTRY IS GLOBAL. The entry-variant sweep is a run-level setting (in cfg),
// NOT a per-cohort dimension — so NO cohort and NO global_default emits an `entry`
// key. The session grid governs only enabled / TP / BE / risk_reduction / risk_amount.

import { SESSIONS, CELLS, buildEntryKey, armToFillMode } from "./cohortKeys";

export const SESSION_SCENARIO_VERSION = 1;

const numOrNull = (v) => (v != null && v !== "" && isFinite(Number(v)) ? Number(v) : null);

// ── Per-dimension translators (sel → backend shape | null) ──────────────────────
// compileEntry/compileBe/compileTarget mirror scenarioCompile.js exactly so the
// emitted JSON is byte-shape-identical to what the backend already consumes.
function compileEntry(sel) {
    if (!sel || !sel.model) return null;
    if (sel.model === "baseline") return { model: "baseline", entry_key: "baseline" };
    if (sel.model === "triggered_edge") {
        return {
            model: "triggered_edge",
            threshold: Number(sel.threshold),
            arm: sel.arm,
            fill_mode: armToFillMode(sel.arm),
            entry_key: buildEntryKey(sel),
        };
    }
    if (sel.model === "penetration") {
        return { model: "penetration", threshold: Number(sel.threshold), entry_key: buildEntryKey(sel) };
    }
    return null;
}

function compileBe(sel) {
    if (!sel) return null;
    return { trigger: sel.trigger, arm_r: Number(sel.armR) };
}

function compileTarget(sel) {
    if (!sel || sel.value == null) return null;
    return { type: "rr", rr: Number(sel.value) };
}

// Per-cohort Risk Amount (v1) — pure post-fill weight (multiplier). Accepts a bare
// number or { value }. Negative / invalid → null (= the backend's 1.0 default). 0 is
// valid (contributes 0 weighted-R while still counting in raw).
function compileRiskAmount(sel) {
    const raw = sel != null && typeof sel === "object" ? sel.value : sel;
    const n = numOrNull(raw);
    if (n == null || n < 0) return null;
    return n;
}

// Additive (backend support pending). Normalised to snake_case numeric params.
function compileRiskReduction(sel) {
    if (!sel || !sel.kind) return null;
    if (sel.kind === "move_stop") {
        return { kind: "move_stop", at_r: numOrNull(sel.atR ?? sel.at_r), to_r: numOrNull(sel.toR ?? sel.to_r) };
    }
    if (sel.kind === "partial_close") {
        return { kind: "partial_close", at_r: numOrNull(sel.atR ?? sel.at_r), fraction: numOrNull(sel.fraction) };
    }
    return { kind: String(sel.kind) };
}

// Reserved per-cohort execution overrides — defaults to all-null (matches the
// scenarioCompile reserved `exec` block); honours explicit overrides when present.
function compileExec(sel) {
    return {
        entry_buffer_pips: numOrNull(sel?.entryBufferPips ?? sel?.entry_buffer_pips),
        stop_buffer_pips: numOrNull(sel?.stopBufferPips ?? sel?.stop_buffer_pips),
        ob_entry_depth_pct: numOrNull(sel?.obEntryDepthPct ?? sel?.ob_entry_depth_pct),
        verify_limit_ticks: numOrNull(sel?.verifyLimitTicks ?? sel?.verify_limit_ticks),
    };
}

// flat single-level resolution: explicit cohort value, else the run Global Default.
const inherit = (cohortVal, gdVal) => (cohortVal != null ? cohortVal : (gdVal != null ? gdVal : null));

function buildBaselineComparison(baseline, cohorts) {
    if (!baseline || baseline.enabled !== true) return { enabled: false };
    const mode = baseline.mode === "whole_run" ? "whole_run" : "eligible";
    const eligible = (mode === "eligible" ? cohorts.filter((c) => c.enabled) : cohorts).map((c) => c.cohort_key);
    return {
        enabled: true,
        mode,
        entry: { model: "baseline", entry_key: "baseline" },   // baseline entry is fixed
        target: compileTarget(baseline.target),
        be: compileBe(baseline.be || null),
        risk_reduction: compileRiskReduction(baseline.riskReduction || null),
        eligible_cohort_keys: eligible,                        // derived; explicit so preview == payload
    };
}

/**
 * Compile a session-first selection into the backend scenario + baseline blocks.
 * Deterministic: cohorts are emitted in SESSIONS × CELLS order with fixed key order.
 * @returns {{ session_strategy_scenario: object, baseline_comparison: object }}
 */
export function buildSessionScenarioConfig(input = {}) {
    const gd = (input && input.globalDefault) || {};
    const sessions = (input && input.sessions) || {};

    const cohorts = [];
    for (const s of SESSIONS) {
        const sCfg = sessions[s.key];
        const sessionOn = Boolean(sCfg && sCfg.enabled !== false);
        const setups = (sCfg && sCfg.setups) || {};
        for (const c of CELLS) {
            const setup = setups[c.key];
            const enabled = sessionOn && Boolean(setup) && setup.enabled !== false;
            // V1: entry is GLOBAL (the run's entry-variant sweep) — never per-cohort.
            // The session grid only governs enabled/TP/BE/risk_reduction/risk_amount.
            const effTarget = enabled ? inherit(setup.target, gd.target) : null;
            const effBe     = enabled ? inherit(setup.be, gd.be) : null;
            const effRR     = enabled ? inherit(setup.riskReduction, gd.riskReduction) : null;
            const effRA     = enabled ? inherit(setup.riskAmount, gd.riskAmount) : null;
            cohorts.push({
                session: s.key,
                structure: c.structure,
                direction: c.direction,
                cohort_key: `${s.key}|${c.key}`,
                enabled,
                be: enabled ? compileBe(effBe) : null,
                target: enabled ? compileTarget(effTarget) : null,
                risk_reduction: enabled ? compileRiskReduction(effRR) : null,
                risk_amount: enabled ? compileRiskAmount(effRA) : null,   // null ⇒ backend 1.0 default
                protection: null,                                      // reserved
                exec: compileExec(enabled ? setup.exec : null),       // reserved (all-null by default)
            });
        }
    }

    const scenario = {
        version: SESSION_SCENARIO_VERSION,
        enabled: input.enabled === true,
        global_default: {
            // V1: no entry in the global default — entry is the run-level sweep, not
            // a scenario dimension. Only the per-cohort management knobs default here.
            be: compileBe(gd.be || null),
            target: compileTarget(gd.target || null),
            risk_reduction: compileRiskReduction(gd.riskReduction || null),
            risk_amount: compileRiskAmount(gd.riskAmount),
        },
        cohorts,
        warnings: [],
    };

    return {
        session_strategy_scenario: scenario,
        baseline_comparison: buildBaselineComparison(input.baseline, cohorts),
    };
}

/**
 * Attach the compiled session-first blocks onto a base sidecar payload (P4B wiring).
 * The SINGLE source of truth for how a run payload gains its scenario:
 *   • session_strategy_scenario is attached only when enabled === true
 *   • baseline_comparison is attached only when enabled === true
 *   • the base payload (cfg-derived: pair/dates/TFs/entry sweep/stop buffer) is never
 *     mutated and never has entry pulled from the scenario (entry stays global).
 * Pure + deterministic → preview (this output) == submitted payload by construction.
 * @returns {object} a NEW payload object (base spread + optional scenario/baseline)
 */
export function attachSessionStrategy(basePayload, sessionStrategy) {
    const payload = { ...(basePayload || {}) };
    const { session_strategy_scenario, baseline_comparison } = buildSessionScenarioConfig(sessionStrategy || {});
    if (session_strategy_scenario && session_strategy_scenario.enabled === true) {
        payload.session_strategy_scenario = session_strategy_scenario;
    }
    if (baseline_comparison && baseline_comparison.enabled === true) {
        payload.baseline_comparison = baseline_comparison;
    }
    return payload;
}

export default buildSessionScenarioConfig;
