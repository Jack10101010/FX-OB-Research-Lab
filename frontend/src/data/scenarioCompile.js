// scenarioCompile.js — SESSION-STRATEGY-SCENARIO (Phase 1: compile only).
//
// PURE compiler: turn the frontend Session Portfolio (normalized `profiles`) into
// a backend-ready run config with an additive `session_strategy_scenario` block.
// This is the bridge object that a future "Run True Scenario Backtest" submits
// through the existing /runs path; in Phase 1 it only powers "Export Scenario
// Config". No backend changes, no preview changes — `applySessionProfiles` is
// untouched.
//
// GUARANTEES
//   • Deterministic: cohorts are emitted in SESSIONS × CELLS order; object keys
//     are built in fixed order, so JSON output is byte-stable across calls.
//   • Full inheritance: each cohort carries its EFFECTIVE rule resolved through
//     cohort override → session default → global default → none (via
//     resolveCohortConfig). `null` for a dimension means "inherit the run's
//     global config" (baseConfig). global_default is also emitted for reference.
//   • Disabled cohorts compile to { enabled:false, entry:null, be:null, target:null }.
//   • Backward compatible: the block is purely additive on top of baseConfig; a
//     backend that ignores it runs the normal global config.
//
// The compiler is bundle/availability-INDEPENDENT by design — whether an exported
// variant exists is a preview/runtime concern, not a compile concern. The backend
// determines real availability by actually running.

import { normalizeProfiles, resolveCohortConfig, buildEntryKey, SESSIONS, CELLS } from "./sessionProfiles";

export const SCENARIO_SCHEMA_VERSION = 1;

// Mirror of sessionProfiles' (module-private) armToFillMode — same mapping.
function armToFillMode(arm) {
    if (arm == null) return null;
    const a = String(arm).trim().toLowerCase();
    if (a === "same" || a === "next") return a;
    if (/^d\d+$/.test(a)) return a;
    if (a === "c0" || a === "0") return "same";
    if (a === "c1" || a === "1") return "next";
    const cm = a.match(/^c(\d+)$/);
    if (cm) return `d${cm[1]}`;
    if (/^\d+$/.test(a)) return `d${a}`;
    return null;
}

// ── per-dimension translators (sel → backend-shaped object | null) ──────────────
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

function compileGlobalDefault(profiles) {
    const gd = profiles.globalDefaultRef || {};
    const look = (kind, ref) => (ref ? (profiles.profiles?.[kind]?.[ref] || null) : null);
    return {
        entry: compileEntry(look("entry", gd.entry)),
        be: compileBe(look("be", gd.be)),
        target: compileTarget(look("target", gd.target)),
    };
}

/**
 * Compile a Session Portfolio into a backend run config.
 * @param {object} profiles    raw or normalized session-portfolio profiles
 * @param {object} [baseConfig] the global run config to extend (e.g. the active
 *                              bundle's config). Spread first; the scenario block
 *                              is added under `session_strategy_scenario`.
 * @returns {object} { ...baseConfig, session_strategy_scenario }
 */
export function compileScenarioToRunConfig(profiles, baseConfig = {}) {
    const norm = normalizeProfiles(profiles);

    const cohorts = [];
    for (const s of SESSIONS) {
        for (const c of CELLS) {
            const cfg = resolveCohortConfig(norm, s.key, c.key);
            const disabled = !!cfg.disabled;
            cohorts.push({
                session: s.key,
                structure: c.structure,
                direction: c.direction,
                cohort_key: `${s.key}|${c.key}`,
                enabled: !disabled,
                entry: disabled ? null : compileEntry(cfg.entry),
                be: disabled ? null : compileBe(cfg.be),
                target: disabled ? null : compileTarget(cfg.target),
                protection: null, // reserved — future protection profile
                exec: { // reserved — future backend-only execution params
                    entry_buffer_pips: null,
                    stop_buffer_pips: null,
                    ob_entry_depth_pct: null,
                    verify_limit_ticks: null,
                },
            });
        }
    }

    const scenario = {
        version: SCENARIO_SCHEMA_VERSION,
        enabled: norm.enabled === true,
        global_default: compileGlobalDefault(norm),
        cohorts,
        warnings: [],
    };

    const base = (baseConfig && typeof baseConfig === "object") ? baseConfig : {};
    return { ...base, session_strategy_scenario: scenario };
}
