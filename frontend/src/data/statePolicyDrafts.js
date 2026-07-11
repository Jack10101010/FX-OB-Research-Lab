// statePolicyDrafts.js — Draft research layer for Cohort × Market State policies
// (STATE-TARGET-POLICY-UI-PLAN-1 §7, corrected per architecture review).
//
// SCOPING (correction 2): a draft belongs to ONE research universe, identified by a
// STRATEGY SIGNATURE — `instrument|detection_tf|entry_family|threshold|delay|variant`
// (e.g. "EURUSD|15min|triggered_edge|25|d3|allow_multi_position"). Draft key =
// `${signature}::${cohortKey}::${state}`. Drafts from one strategy can never appear
// in another. Legacy v1 drafts (keyed cohort::state only) are migrated once into the
// TE25-C3 signature — the only universe they were ever created under — deduped
// against any existing scoped drafts and marked { migrated: true }.
//
// LIFECYCLE (correction 3):
//   Inspect → Candidate → Confirmed → Added to Run → Native Validated → Approved → Deployed
//   plus Rejected as a terminal side-state reachable from anywhere.
//   • "Added to Run"     = copied into execution configuration (Strategy Builder apply)
//   • "Native Validated" = a successful native confirmation run exists
//   • "Approved"         = accepted for live policy
//   • "Deployed"         = currently active
// Transitions are guarded: one step forward, one step back (correction), Rejected
// from anywhere, re-open Rejected → Inspect. The old "Applied" status migrates to
// "Added to Run".
//
// SEPARATION: drafts live in localStorage, never feed the backend, and reach the
// active run configuration ONLY through the explicit applyDraftsToOverrides() action.

import { STATE_AXIS, normalizeCell } from "./stateTargetOverrides";
import { snapTarget } from "./cohortTargetOverrides";

export const DRAFT_STATUSES = Object.freeze([
    "Inspect", "Candidate", "Confirmed", "Added to Run", "Native Validated", "Approved", "Deployed",
]);
export const DRAFT_TERMINAL = "Rejected";
export const ALL_DRAFT_STATUSES = Object.freeze([...DRAFT_STATUSES, DRAFT_TERMINAL]);

export const DRAFT_KEY = "fxob.statePolicyDrafts.v2";
export const LEGACY_DRAFT_KEY = "fxob.statePolicyDrafts.v1";
// The only universe v1 drafts were ever created under (TE 25% · C3 · EURUSD 15min).
export const LEGACY_MIGRATION_SIGNATURE = "EURUSD|15min|triggered_edge|25|d3|allow_multi_position";

/** Canonical strategy signature. Missing parts render as "?" so a partially known
 *  context still yields a stable, non-colliding scope (never silently merges). */
export function buildStrategySignature({ instrument, detectionTf, family, threshold, delay, variant } = {}) {
    const part = (v) => (v === 0 || (v != null && v !== "") ? String(v) : "?");
    return [part(instrument), part(detectionTf), part(family), part(threshold), part(delay), part(variant)].join("|");
}

/** Lifecycle guard: same status, ±1 step along the chain, Rejected from anywhere,
 *  and Rejected → Inspect (re-open). Everything else is refused. */
export function canTransition(from, to) {
    if (!ALL_DRAFT_STATUSES.includes(to)) return false;
    if (from == null) return to === "Inspect" || to === "Candidate";  // new drafts start early
    if (from === to) return true;
    if (to === DRAFT_TERMINAL) return true;
    if (from === DRAFT_TERMINAL) return to === "Inspect";
    const a = DRAFT_STATUSES.indexOf(from);
    const b = DRAFT_STATUSES.indexOf(to);
    if (a < 0 || b < 0) return false;
    return Math.abs(b - a) === 1;
}

const memoryFallback = {};
const listeners = new Set();
export function subscribeDrafts(fn) { listeners.add(fn); return () => listeners.delete(fn); }

function notifyDrafts() {
    for (const fn of listeners) { try { fn(); } catch (_e) { /* listener errors never propagate */ } }
}

function rawRead(key) {
    try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : null;
    } catch (_e) {
        return null;
    }
}

function readAll() {
    migrateLegacyOnce();
    const v2 = rawRead(DRAFT_KEY);
    return v2 || { ...memoryFallback };
}

function writeAll(all) {
    try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify(all));
    } catch (_e) {
        // REPLACE the fallback contents (merge would resurrect deleted drafts).
        for (const k of Object.keys(memoryFallback)) delete memoryFallback[k];
        Object.assign(memoryFallback, all);
    }
    notifyDrafts();
}

// ── One-time v1 → v2 migration (dedupe-safe, idempotent) ───────────────────────
let migrated = false;
function migrateLegacyOnce() {
    if (migrated) return;
    migrated = true;
    const legacy = rawRead(LEGACY_DRAFT_KEY);
    if (!legacy || typeof legacy !== "object") return;
    const v2 = rawRead(DRAFT_KEY) || {};
    let moved = 0;
    for (const [oldKey, d] of Object.entries(legacy)) {
        if (!d || typeof d !== "object") continue;
        const [cohortKey, state] = oldKey.split("::");
        if (!cohortKey || !STATE_AXIS.includes(state)) continue;
        const newKey = `${LEGACY_MIGRATION_SIGNATURE}::${cohortKey}::${state}`;
        if (v2[newKey]) continue; // scoped draft wins — no duplicates
        const status = d.status === "Applied" ? "Added to Run"
            : ALL_DRAFT_STATUSES.includes(d.status) ? d.status : "Inspect";
        v2[newKey] = { ...d, status, migrated: true, updatedAt: d.updatedAt || new Date().toISOString() };
        moved += 1;
    }
    if (moved) {
        try {
            localStorage.setItem(DRAFT_KEY, JSON.stringify(v2));
            localStorage.removeItem(LEGACY_DRAFT_KEY);
        } catch (_e) {
            Object.assign(memoryFallback, v2);
        }
    }
}

export const draftKeyOf = (signature, cohortKey, state) => `${signature}::${cohortKey}::${state}`;

export function getDraft(signature, cohortKey, state) {
    return readAll()[draftKeyOf(signature, cohortKey, state)] || null;
}

/** All drafts for ONE strategy signature (never leaks other universes). */
export function listDrafts(signature) {
    const all = readAll();
    if (!signature) return {};
    const out = {};
    const prefix = `${signature}::`;
    for (const [k, v] of Object.entries(all)) if (k.startsWith(prefix)) out[k.slice(prefix.length)] = v;
    return out;
}

export function saveDraft(signature, cohortKey, state, patch) {
    if (!signature || !STATE_AXIS.includes(state)) return null;   // labels are never invented
    const all = readAll();
    const key = draftKeyOf(signature, cohortKey, state);
    const prev = all[key] || null;
    let nextStatus = prev ? prev.status : null;
    if (patch.status !== undefined) {
        if (!canTransition(prev ? prev.status : null, patch.status)) return { ...prev, _rejectedTransition: patch.status };
        nextStatus = patch.status;
    }
    const target = patch.target === undefined
        ? (prev ? prev.target : null)
        : (patch.target == null ? null : (Number.isFinite(Number(patch.target)) ? snapTarget(Number(patch.target)) : null));
    const next = {
        target,
        block: patch.block !== undefined ? Boolean(patch.block) : Boolean(prev && prev.block),
        confidence: patch.confidence !== undefined ? (patch.confidence || null) : (prev ? prev.confidence : null),
        notes: patch.notes !== undefined ? String(patch.notes) : ((prev && prev.notes) || ""),
        status: nextStatus || "Inspect",
        evidence: patch.evidence !== undefined ? (patch.evidence || null) : (prev ? prev.evidence : null),
        migrated: Boolean(prev && prev.migrated),
        updatedAt: new Date().toISOString(),
    };
    all[key] = next;
    writeAll(all);
    return next;
}

export function deleteDraft(signature, cohortKey, state) {
    const all = readAll();
    delete all[draftKeyOf(signature, cohortKey, state)];
    writeAll(all);
}

/**
 * The EXPLICIT bridge from research to execution: fold every CONFIRMED draft OF THIS
 * SIGNATURE into a stateTargetOverrides map (block → block cell; target → custom
 * cell) and advance those drafts to "Added to Run". Nothing else ever crosses.
 */
export function applyDraftsToOverrides(signature, currentOverrides) {
    const all = readAll();
    const overrides = JSON.parse(JSON.stringify(currentOverrides || {}));
    let applied = 0;
    const prefix = `${signature}::`;
    for (const [key, d] of Object.entries(all)) {
        if (!key.startsWith(prefix) || !d || d.status !== "Confirmed") continue;
        const [cohortKey, state] = key.slice(prefix.length).split("::");
        if (!STATE_AXIS.includes(state)) continue;
        overrides[cohortKey] = overrides[cohortKey] || {};
        overrides[cohortKey][state] = normalizeCell(
            d.block ? { mode: "block" } : (d.target != null ? { mode: "custom", rr: d.target } : { mode: "inherit" }),
        );
        all[key] = { ...d, status: "Added to Run", updatedAt: new Date().toISOString() };
        applied += 1;
    }
    if (applied) writeAll(all);
    return { overrides, appliedCount: applied };
}

/** Count drafts by status for ONE signature (panel/matrix badges). */
export function draftCounts(signature) {
    const counts = {};
    for (const d of Object.values(listDrafts(signature))) {
        if (!d) continue;
        counts[d.status] = (counts[d.status] || 0) + 1;
    }
    return counts;
}
