// portfolioPolicy.js — Portfolio Manager v1 (Phase 3): read-only policy-table loader.
//
// PURE, dependency-light. Normalizes a deployed decision-policy document
// (configs/policy/deployed_policy.vN.json, mirrored to src/data/deployedPolicy.v1.json)
// into rows the viewer can render + filter. NO React, NO store, NO mutation, NO
// execution. Cohort keys reuse the canonical primitives from cohortKeys.js so the
// frontend and the Lux backend agree on (instrument | session | cell).
//
// SYNC PROCESS (documented): the JSON is a MIRROR of the Lux backend artifact
//   Lux:  configs/policy/deployed_policy.v1.json
//   FX :  frontend/src/data/deployedPolicy.v1.json
// To refresh, copy the Lux file over the FX mirror (single source of truth = Lux).
// The loader is pure — it takes the parsed doc as an argument — so the page imports
// the JSON and passes it in, and tests can read the file directly.

import { canonicalSession, canonicalStructure, canonicalDirection, SESSION_KEYS } from "./cohortKeys";

// The policy JSON stores already-canonical session KEYS (e.g. "ny_pm"), while
// canonicalSession() is built for raw trade LABELS (e.g. "New York PM"). Accept both:
// pass a valid canonical key straight through, else canonicalise a raw label.
const _sessionKeySet = new Set(SESSION_KEYS);
function canonSession(raw) {
    return _sessionKeySet.has(raw) ? raw : canonicalSession(raw);
}

export const POLICY_SCHEMA_VERSION = 1;
export const POLICY_REGIMES = ["LABEL", "STATE_ONLY", "DIRECTION_AWARE", "DISABLE"];
export const CONFIDENCES = ["HIGH", "MEDIUM", "LOW", "MORE_DATA_REQUIRED"];

const REGIME_SET = new Set(POLICY_REGIMES);
const CONF_SET = new Set(CONFIDENCES);

function toCell(structure, direction) {
    const s = canonicalStructure(structure) === "CHoCH" ? "choch" : "bos";
    const d = canonicalDirection(direction) === "Short" ? "short" : "long";
    return `${s}_${d}`;
}

/** Instrument-scoped cohort key: `INSTR|session|cell` (matches the Lux backend). */
export function cohortKey(instrument, session, structure, direction) {
    return `${instrument}|${canonSession(session)}|${toCell(structure, direction)}`;
}

const num = (v) => (v == null || v === "" || Number.isNaN(Number(v)) ? null : Number(v));

/** Normalize ONE raw cohort record into a stable viewer row. */
export function normalizeCohort(raw) {
    const instrument = String(raw.instrument || "").trim();
    const session = canonSession(raw.session);
    const structure = canonicalStructure(raw.structure);
    const direction = canonicalDirection(raw.direction);
    const regime = raw.decision_policy && raw.decision_policy.regime;
    return {
        instrument,
        session,
        structure,                                   // "BOS" | "CHoCH"
        direction,                                   // "Long" | "Short"
        cohortKey: raw.cohort_key || cohortKey(instrument, session, structure, direction),
        policy: REGIME_SET.has(regime) ? regime : "LABEL",
        confidence: CONF_SET.has(raw.confidence) ? raw.confidence : null,
        sampleSize: num(raw.sample_size),
        netRLabel: num(raw.net_r_label),
        netRState: num(raw.net_r_state),
        netRDirection: num(raw.net_r_direction),
        bestPolicy: REGIME_SET.has(raw.best_policy) ? raw.best_policy : null,
        recommendation: raw.recommendation || null,
        rationale: raw.rationale || "",
        sourceResearch: raw.source_research || "",
    };
}

/** Light schema validation — throws on structural problems, tolerant of extra keys. */
export function validatePolicyDoc(doc) {
    if (!doc || typeof doc !== "object") throw new Error("policy doc must be an object");
    if (doc.schema_version !== POLICY_SCHEMA_VERSION) {
        throw new Error(`unsupported schema_version ${doc.schema_version} (expected ${POLICY_SCHEMA_VERSION})`);
    }
    if (typeof doc.policy_version !== "string" || !doc.policy_version.trim()) {
        throw new Error("policy_version must be a non-empty string");
    }
    if (!Array.isArray(doc.cohorts)) throw new Error("cohorts must be an array");
    return true;
}

/**
 * Load + normalize a deployed policy document into a table object:
 *   { policyVersion, createdAt, sourceResearch, cohorts:[row], byKey:Map, counts }
 * Pure — no I/O. Pass the parsed JSON in.
 */
export function loadPolicy(doc) {
    validatePolicyDoc(doc);
    const cohorts = doc.cohorts.map(normalizeCohort);
    const byKey = new Map(cohorts.map((c) => [c.cohortKey, c]));
    return {
        policyVersion: doc.policy_version,
        createdAt: doc.created_at || "",
        sourceResearch: doc.source_research || "",
        notes: doc.notes || "",
        cohorts,
        byKey,
        counts: policyCounts(cohorts),
    };
}

/** Counts by policy + by confidence, plus total. */
export function policyCounts(cohorts) {
    const byPolicy = Object.fromEntries(POLICY_REGIMES.map((p) => [p, 0]));
    const byConfidence = Object.fromEntries(CONFIDENCES.map((c) => [c, 0]));
    for (const c of cohorts) {
        if (byPolicy[c.policy] != null) byPolicy[c.policy] += 1;
        if (c.confidence && byConfidence[c.confidence] != null) byConfidence[c.confidence] += 1;
    }
    return { total: cohorts.length, byPolicy, byConfidence };
}

/** Lookup a normalized row by cohort key, or by parts. Returns null when absent. */
export function lookupCohort(table, keyOrInstrument, session, structure, direction) {
    if (!table || !table.byKey) return null;
    const key = session === undefined
        ? keyOrInstrument
        : cohortKey(keyOrInstrument, session, structure, direction);
    return table.byKey.get(key) || null;
}

/** Distinct filter option values present in the rows (sorted, stable). */
export function filterOptions(cohorts) {
    const uniq = (vals) => Array.from(new Set(vals.filter((v) => v != null && v !== "")));
    return {
        instrument: uniq(cohorts.map((c) => c.instrument)).sort(),
        session: uniq(cohorts.map((c) => c.session)),
        structure: uniq(cohorts.map((c) => c.structure)),
        direction: uniq(cohorts.map((c) => c.direction)),
        policy: POLICY_REGIMES.filter((p) => cohorts.some((c) => c.policy === p)),
        confidence: CONFIDENCES.filter((c) => cohorts.some((r) => r.confidence === c)),
    };
}

/** Filter rows. `filters` = { instrument, session, structure, direction, policy, confidence }
 *  where each value is a string (exact match) or falsy (= "all"). */
export function filterCohorts(cohorts, filters = {}) {
    const match = (val, want) => !want || val === want;
    return cohorts.filter((c) =>
        match(c.instrument, filters.instrument) &&
        match(c.session, filters.session) &&
        match(c.structure, filters.structure) &&
        match(c.direction, filters.direction) &&
        match(c.policy, filters.policy) &&
        match(c.confidence, filters.confidence));
}
