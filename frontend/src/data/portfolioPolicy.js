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

export const CHECKSUM_STALE_MSG =
    "Frontend policy mirror is stale. Please mirror deployed_policy.v1.json from Lux " +
    "(scripts/mirror_portfolio_policy.py).";

// Canonical serialization — MUST match src/portfolio_policy.py._canon in Lux so the
// Python-written policy_sha256 verifies here byte-for-byte. Integer-valued numbers
// (incl. floats like 12.0) serialize as integers; object keys sorted; compact.
function canon(v) {
    if (v === true) return "true";
    if (v === false) return "false";
    if (v === null || v === undefined) return "null";
    if (typeof v === "number") return String(v);           // 12.0→"12", 9.129→"9.129"
    if (typeof v === "string") return JSON.stringify(v);
    if (Array.isArray(v)) return "[" + v.map(canon).join(",") + "]";
    if (typeof v === "object") {
        const ks = Object.keys(v).sort();
        return "{" + ks.map((k) => JSON.stringify(k) + ":" + canon(v[k])).join(",") + "}";
    }
    throw new Error("uncanonicalisable value");
}

/** Canonical string over {schema_version, policy_version, cohorts} (checksum input). */
export function policyCanonicalString(doc) {
    return canon({
        schema_version: doc.schema_version,
        policy_version: doc.policy_version,
        cohorts: doc.cohorts || [],
    });
}

/**
 * Verify the embedded policy_sha256 against the recomputed content hash.
 * `hashHex` is an injected `(utf8String) => hexDigest` (node crypto in tests /
 * SubtleCrypto in the app) so this module stays environment-agnostic and pure.
 * Returns { ok, embedded, actual }. ok is true when there is no embedded checksum
 * (older docs) OR it matches.
 */
export function verifyPolicyChecksum(doc, hashHex) {
    const embedded = doc && doc.policy_sha256 != null ? doc.policy_sha256 : null;
    const actual = hashHex(policyCanonicalString(doc));
    return { ok: embedded === null || embedded === actual, embedded, actual };
}

const _SESSION_KEYS = new Set(SESSION_KEYS);
const _STRUCTURES = new Set(["BOS", "CHoCH"]);
const _DIRECTIONS = new Set(["Long", "Short"]);

/**
 * GUARD-grade validation (Phase 5). Throws an explicit Error on the first problem:
 * schema, policy_version, duplicate cohorts, non-canonical cohort keys, unknown
 * policy/confidence values, optional exact cohort count, and — when `hashHex` is
 * provided — the integrity checksum (stale/tampered mirror). Returns true on success.
 */
export function validateMirror(doc, hashHex = null, opts = {}) {
    validatePolicyDoc(doc);                       // schema_version / policy_version / cohorts array
    const seen = new Set();
    doc.cohorts.forEach((c, i) => {
        const at = `cohorts[${i}]`;
        if (!c || typeof c !== "object") throw new Error(`${at} must be an object`);
        if (!_SESSION_KEYS.has(c.session)) throw new Error(`${at}.session ${c.session} not canonical`);
        if (!_STRUCTURES.has(c.structure)) throw new Error(`${at}.structure ${c.structure} invalid`);
        if (!_DIRECTIONS.has(c.direction)) throw new Error(`${at}.direction ${c.direction} invalid`);
        const regime = c.decision_policy && c.decision_policy.regime;
        if (!POLICY_REGIMES.includes(regime)) throw new Error(`${at}.decision_policy.regime ${regime} invalid`);
        if (c.confidence != null && !CONFIDENCES.includes(c.confidence)) {
            throw new Error(`${at}.confidence ${c.confidence} invalid`);
        }
        const derived = cohortKey(c.instrument, c.session, c.structure, c.direction);
        if (c.cohort_key != null && c.cohort_key !== derived) {
            throw new Error(`${at}.cohort_key ${c.cohort_key} != derived ${derived}`);
        }
        if (seen.has(derived)) throw new Error(`${at} duplicate cohort ${derived}`);
        seen.add(derived);
    });
    if (opts.expectedCohorts != null && doc.cohorts.length !== opts.expectedCohorts) {
        throw new Error(`expected ${opts.expectedCohorts} cohorts, got ${doc.cohorts.length}`);
    }
    if (hashHex) {
        const { ok, embedded, actual } = verifyPolicyChecksum(doc, hashHex);
        if (!ok) throw new Error(`${CHECKSUM_STALE_MSG} (embedded ${embedded} != content ${actual})`);
    }
    return true;
}

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
        sourceCommit: doc.source_commit || "",
        policySha256: doc.policy_sha256 || "",
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
