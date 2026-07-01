// sessionStrategyEdits.js — pure, run-scoped reducers for the Session Strategy state
// that feeds buildSessionScenarioConfig (P4C authoring UI).
//
// PURE: every function returns a NEW state object; no mutation, no React, no store, no
// localStorage. The grid component binds inputs to these; validators test them directly.
// State shape (matches the sessionScenarioConfig.js input contract — NO per-cohort entry):
//   {
//     enabled,
//     globalDefault: {},
//     sessions: { [sessionKey]: { enabled, setups: { [cellKey]: {
//        enabled, target:{value}, be:{trigger,armR}, riskReduction:{kind:"move_stop",atR,toR}, riskAmount } } } },
//     baseline: { enabled, mode:"eligible", target:{value}, be:{trigger,armR} }
//   }

import buildSessionScenarioConfig from "./sessionScenarioConfig";
import { SESSIONS, CELLS } from "./cohortKeys";

export const EMPTY_SESSION_STRATEGY = {
    enabled: false,
    globalDefault: {},
    sessions: {},
    baseline: { enabled: false, mode: "eligible" },
};

// Default builder state — Session Strategy v1 is the primary flow: ON, with a Fair
// Baseline ON and sane Run Defaults (TP 2R, BE none, move-stop off, risk 1.0) that newly
// enabled cohorts inherit. No sessions are pre-enabled (the user opts cohorts in).
export const DEFAULT_SESSION_STRATEGY = {
    enabled: true,
    globalDefault: { target: { value: 2 }, riskAmount: 1.0 },   // BE none, move-stop off
    sessions: {},
    baseline: { enabled: true, mode: "eligible", target: { value: 2 } },  // BE none
};

const numOrU = (v) => (v === "" || v == null || !isFinite(Number(v)) ? undefined : Number(v));

function _session(state, sk) {
    return state.sessions[sk] || { enabled: true, setups: {} };
}

function _patchCohort(state, sk, ck, patch) {
    const s = _session(state, sk);
    const setups = s.setups || {};
    const cur = setups[ck] || { enabled: true };   // first touch auto-creates an enabled cohort
    return {
        ...state,
        sessions: { ...state.sessions, [sk]: { ...s, setups: { ...setups, [ck]: { ...cur, ...patch } } } },
    };
}

// ── top / session / cohort enablement ────────────────────────────────────────────
export function setStrategyEnabled(state, on) {
    return { ...state, enabled: !!on };
}

export function setSessionEnabled(state, sk, on) {
    const s = _session(state, sk);
    return { ...state, sessions: { ...state.sessions, [sk]: { ...s, enabled: !!on } } };
}

export function setCohortEnabled(state, sk, ck, on) {
    return _patchCohort(state, sk, ck, { enabled: !!on });
}

// Bulk enable/disable a set of cohorts in one session (quick actions). Pure.
export function setCohortsEnabled(state, sk, cellKeys, on) {
    return (cellKeys || []).reduce((acc, ck) => setCohortEnabled(acc, sk, ck, on), state);
}

// ── per-cohort dimensions ────────────────────────────────────────────────────────
export function setCohortTarget(state, sk, ck, value) {
    const n = numOrU(value);
    return _patchCohort(state, sk, ck, { target: n == null ? undefined : { value: n } });
}

export function setCohortBe(state, sk, ck, trigger, armR) {
    const t = trigger || "";
    if (t !== "wick" && t !== "close") return _patchCohort(state, sk, ck, { be: undefined });
    return _patchCohort(state, sk, ck, { be: { trigger: t, armR: numOrU(armR) ?? 1 } });
}

export function setCohortMoveStop(state, sk, ck, atR, toR) {
    const a = numOrU(atR);
    if (a == null) return _patchCohort(state, sk, ck, { riskReduction: undefined });
    return _patchCohort(state, sk, ck, { riskReduction: { kind: "move_stop", atR: a, toR: numOrU(toR) ?? 0 } });
}

export function setCohortRiskAmount(state, sk, ck, ra) {
    return _patchCohort(state, sk, ck, { riskAmount: numOrU(ra) });
}

// ── Fair Baseline ────────────────────────────────────────────────────────────────
export function setBaselineEnabled(state, on) {
    return { ...state, baseline: { ...(state.baseline || {}), enabled: !!on, mode: state.baseline?.mode || "eligible" } };
}

export function setBaselineTarget(state, value) {
    const n = numOrU(value);
    return { ...state, baseline: { ...(state.baseline || {}), target: n == null ? undefined : { value: n } } };
}

export function setBaselineBe(state, trigger, armR) {
    const t = trigger || "";
    const be = (t === "wick" || t === "close") ? { trigger: t, armR: numOrU(armR) ?? 1 } : undefined;
    return { ...state, baseline: { ...(state.baseline || {}), be } };
}

// ── Run Defaults (globalDefault — inherited by every newly enabled cohort) ────────
function _gd(state, patch) {
    return { ...state, globalDefault: { ...(state.globalDefault || {}), ...patch } };
}
export function setDefaultTarget(state, value) {
    const n = numOrU(value);
    return _gd(state, { target: n == null ? undefined : { value: n } });
}
export function setDefaultBe(state, trigger, armR) {
    const t = trigger || "";
    return _gd(state, { be: (t === "wick" || t === "close") ? { trigger: t, armR: numOrU(armR) ?? 1 } : undefined });
}
export function setDefaultMoveStop(state, atR, toR) {
    const a = numOrU(atR);
    return _gd(state, { riskReduction: a == null ? undefined : { kind: "move_stop", atR: a, toR: numOrU(toR) ?? 0 } });
}
export function setDefaultRiskAmount(state, ra) {
    return _gd(state, { riskAmount: numOrU(ra) });
}

// ── Apply one session's cohort setup to other sessions ───────────────────────────
// Deep-copies the SOURCE session's { enabled, setups } (enabled states + TP/BE/Reduce
// Risk/risk amount) into each target session. Pure: never touches globalDefault,
// baseline, or run-wide settings; never mutates the source; no localStorage.
export function applySessionSettingsToSessions(state, sourceSessionKey, targetSessionKeys) {
    const src = state.sessions?.[sourceSessionKey];
    if (!src) return state;
    const snapshot = { enabled: src.enabled, setups: src.setups || {} };
    const sessions = { ...(state.sessions || {}) };
    for (const tk of targetSessionKeys || []) {
        if (!tk || tk === sourceSessionKey) continue;
        sessions[tk] = JSON.parse(JSON.stringify(snapshot));   // independent deep copy
    }
    return { ...state, sessions };
}

// ── Enabled-cohorts summary (pure; reads the COMPILED scenario so it reflects
// per-cohort overrides AND inherited Run Defaults exactly as the payload will). ──
const _SESSION_LABEL = Object.fromEntries(SESSIONS.map((s) => [s.key, s.label]));
const _CELL_LABEL = Object.fromEntries(CELLS.map((c) => [`${c.structure}|${c.direction}`, c.label]));

// Risk amount is a multiplier; display it as "1.0x" / "0.5x" / "0.25x" (payload stays numeric).
export function formatRiskMultiplier(ra) {
    const n = ra == null ? 1 : Number(ra);
    return (Number.isInteger(n) ? `${n}.0` : `${n}`) + "x";
}

function _fmtTarget(t) { return t && t.rr != null ? `TP ${t.rr}R` : "TP —"; }
function _fmtBe(be) { return be && be.arm_r != null ? `BE ${be.trigger} ${be.arm_r}R` : "BE off"; }
function _fmtReduceRisk(rr) { return rr && rr.kind === "move_stop" ? `Reduce Risk ${rr.at_r}→${rr.to_r}` : "Reduce Risk off"; }
function _fmtRa(ra) { return `Risk ${formatRiskMultiplier(ra)}`; }

export function summarizeEnabledCohorts(state) {
    const { session_strategy_scenario } = buildSessionScenarioConfig(state || {});
    const enabled = (session_strategy_scenario.cohorts || []).filter((c) => c.enabled);
    const bySession = new Map();
    for (const c of enabled) {
        if (!bySession.has(c.session)) bySession.set(c.session, []);
        bySession.get(c.session).push({
            cohortKey: c.cohort_key,
            label: _CELL_LABEL[`${c.structure}|${c.direction}`] || `${c.structure} ${c.direction}`,
            text: `${_fmtTarget(c.target)} · ${_fmtBe(c.be)} · ${_fmtReduceRisk(c.risk_reduction)} · ${_fmtRa(c.risk_amount)}`,
        });
    }
    // Emit in canonical SESSIONS order.
    return SESSIONS
        .filter((s) => bySession.has(s.key))
        .map((s) => ({ sessionKey: s.key, sessionLabel: _SESSION_LABEL[s.key], cohorts: bySession.get(s.key) }));
}
