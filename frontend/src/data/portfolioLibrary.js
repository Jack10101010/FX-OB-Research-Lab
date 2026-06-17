// portfolioLibrary.js — PORTFOLIO-SAVE-LOAD (MVP).
//
// PURE logic for the Portfolio Library: named, immutable snapshots of a session
// portfolio (`profiles`). No React, no localStorage, no store — all state +
// persistence live in store.js (mirrors the sessionProfiles.js ↔ store.js split).
//
// MODEL
//   • Working copy   = state.sessionProfiles (unchanged; the editable buffer).
//   • Library record = an immutable snapshot { id, name, description, createdAt,
//                      updatedAt, version, projectId, profiles }.
//   • loadedPortfolioId = the single pointer to the record the working copy
//                      descends from (own concept; NOT "activePortfolioId").
//
// IDENTITY / DIRTY
//   • A record's IDENTITY is `profiles` EXCLUDING `enabled` (the master On/Off is
//     working-session state, not part of the saved strategy). Both sides are
//     re-normalized through normalizeProfiles before comparison so version drift
//     and key-insertion order never cause a false "dirty".
//
// Records are returned by value; every mutating helper returns a NEW library map
// (immutable snapshots). projectId is reserved (always present, always null) so a
// future project-scoping feature needs no data migration.

import {
    normalizeProfiles, emptyProfiles, SESSION_PROFILE_VERSION,
    SESSION_KEYS, CELL_KEYS, resolveCohortProvenance,
} from "./sessionProfiles";

export const PORTFOLIO_RECORD_VERSION = 1;

const nowISO = () => new Date().toISOString();

/** Stable, recursively key-sorted JSON — insertion-order-independent equality. */
export function stableStringify(value) {
    const seen = new WeakSet();
    const walk = (v) => {
        if (v === null || typeof v !== "object") return v;
        if (seen.has(v)) return null;
        seen.add(v);
        if (Array.isArray(v)) return v.map(walk);
        const out = {};
        for (const k of Object.keys(v).sort()) out[k] = walk(v[k]);
        return out;
    };
    try { return JSON.stringify(walk(value)); } catch { return ""; }
}

/** Canonical identity of a portfolio: normalized profiles MINUS `enabled`. */
export function canonicalProfiles(profiles) {
    const norm = normalizeProfiles(profiles);
    const { enabled, ...identity } = norm; // eslint-disable-line no-unused-vars
    return stableStringify(identity);
}

/**
 * Dirty = working copy differs from the record it was loaded from. With no loaded
 * record, dirty means the working copy differs from a pristine empty portfolio.
 */
export function isDirty(workingProfiles, record) {
    const lhs = canonicalProfiles(workingProfiles);
    const rhs = canonicalProfiles(record ? record.profiles : emptyProfiles());
    return lhs !== rhs;
}

/** Derived (never stored) summary counts — pure over `profiles`, no bundle. */
export function summarizePortfolio(profiles) {
    let customStrategies = 0, disabledCohorts = 0, targetOverrides = 0;
    for (const s of SESSION_KEYS) {
        for (const c of CELL_KEYS) {
            const pv = resolveCohortProvenance(profiles, s, c);
            if (pv.disabled) { disabledCohorts += 1; continue; }
            const entryC = pv.entry.source === "cohort";
            const beC = pv.be.source === "cohort";
            const targetC = pv.target.source === "cohort";
            if (entryC || beC || targetC) customStrategies += 1;
            if (targetC) targetOverrides += 1;
        }
    }
    return { customStrategies, disabledCohorts, targetOverrides };
}

let _idCounter = 0;
export function newPortfolioId() {
    _idCounter = (_idCounter + 1) % 1e6;
    const rand = Math.random().toString(36).slice(2, 8);
    return `pf_${Date.now().toString(36)}_${_idCounter.toString(36)}${rand}`;
}

/** Coerce any persisted/imported value into a clean record (or null). */
export function normalizeRecord(raw, fallbackId = null) {
    if (!raw || typeof raw !== "object") return null;
    const id = (typeof raw.id === "string" && raw.id) ? raw.id : (fallbackId || newPortfolioId());
    const name = (typeof raw.name === "string" && raw.name.trim()) ? raw.name.trim() : "Untitled";
    const description = typeof raw.description === "string" ? raw.description : "";
    const createdAt = typeof raw.createdAt === "string" ? raw.createdAt : nowISO();
    const updatedAt = typeof raw.updatedAt === "string" ? raw.updatedAt : createdAt;
    const version = Number.isInteger(raw.version) ? raw.version : PORTFOLIO_RECORD_VERSION;
    const projectId = raw.projectId ?? null; // reserved; always present, unused
    const profiles = normalizeProfiles(raw.profiles);
    return { id, name, description, createdAt, updatedAt, version, projectId, profiles, profilesVersion: SESSION_PROFILE_VERSION };
}

/** Coerce a persisted/loaded library blob into a clean id→record map. */
export function normalizeLibrary(raw) {
    const out = {};
    if (!raw || typeof raw !== "object") return out;
    for (const key of Object.keys(raw)) {
        const rec = normalizeRecord(raw[key], key);
        if (rec) out[rec.id] = rec; // record.id is canonical key
    }
    return out;
}

export function isLibraryEmpty(lib) {
    return !lib || typeof lib !== "object" || Object.keys(lib).length === 0;
}

export function listRecords(lib) {
    return Object.values(lib || {}).sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
}

function uniqueName(lib, base) {
    const names = new Set(Object.values(lib || {}).map((r) => r.name));
    if (!names.has(base)) return base;
    let i = 2;
    while (names.has(`${base} (${i})`)) i += 1;
    return `${base} (${i})`;
}

/** Create a new record from `profiles`. Returns { library, id }. */
export function createRecord(lib, { name, description = "", profiles } = {}) {
    const id = newPortfolioId();
    const ts = nowISO();
    const rec = normalizeRecord({
        id, name: uniqueName(lib, (name || "Untitled").trim() || "Untitled"),
        description, createdAt: ts, updatedAt: ts, profiles,
    });
    return { library: { ...lib, [id]: rec }, id };
}

/** Duplicate an existing record under a new id + de-collided name. */
export function duplicateRecord(lib, id) {
    const src = lib?.[id];
    if (!src) return { library: lib, id: null };
    const newId = newPortfolioId();
    const ts = nowISO();
    const rec = { ...src, id: newId, name: uniqueName(lib, `${src.name} (copy)`), createdAt: ts, updatedAt: ts };
    return { library: { ...lib, [newId]: rec }, id: newId };
}

export function renameRecord(lib, id, name) {
    const src = lib?.[id];
    if (!src) return lib;
    const clean = (name || "").trim();
    if (!clean) return lib;
    return { ...lib, [id]: { ...src, name: clean, updatedAt: nowISO() } };
}

export function setRecordDescription(lib, id, description) {
    const src = lib?.[id];
    if (!src) return lib;
    return { ...lib, [id]: { ...src, description: String(description ?? ""), updatedAt: nowISO() } };
}

export function deleteRecord(lib, id) {
    if (!lib?.[id]) return lib;
    const next = { ...lib };
    delete next[id];
    return next;
}

/** Save: overwrite a record's profiles snapshot from the working copy. */
export function saveIntoRecord(lib, id, profiles) {
    const src = lib?.[id];
    if (!src) return lib;
    return { ...lib, [id]: { ...src, profiles: normalizeProfiles(profiles), updatedAt: nowISO() } };
}

/** Pure, non-destructive merge for backend sync: union by id, newer updatedAt wins.
 *  NOTE (MVP): no tombstones — a delete is best-effort across devices. */
export function mergeLibraries(local, remote) {
    const l = normalizeLibrary(local), r = normalizeLibrary(remote);
    const out = {};
    for (const id of new Set([...Object.keys(l), ...Object.keys(r)])) {
        const lc = l[id], rc = r[id];
        if (!lc) { out[id] = rc; continue; }
        if (!rc) { out[id] = lc; continue; }
        const lt = Date.parse(lc.updatedAt || "") || 0;
        const rt = Date.parse(rc.updatedAt || "") || 0;
        out[id] = rt > lt ? rc : lc;
    }
    return out;
}
