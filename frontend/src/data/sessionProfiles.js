// sessionProfiles.js — SESSION-STRATEGY-PROFILES Phase 1.
//
// A FRONTEND-ONLY masking layer over a resolved TradeUniverse. It lets each
// session (London / London Lull / New York / Asia / Outside) enable or disable
// individual structure × direction cohorts (BOS Long / BOS Short / CHoCH Long /
// CHoCH Short). Disabled cohorts are *removed* from the resolved universe.
//
// SCOPE (Phase 1 — deliberately minimal):
//   • Selection/masking only. No target, BE, protection, or entry-model changes.
//   • No backend involvement — operates purely on already-imported trade rows
//     using metadata the backtester already exports (session, structure, direction).
//   • Returns the SAME TradeUniverse contract as data/tradeUniverse.js.
//
// BYTE-IDENTICAL GUARANTEE:
//   When the matrix is disabled, has no "disabled" cell, or removes zero trades,
//   applySessionProfiles() returns the EXACT same universe object reference it was
//   given. The no-profile path is therefore unchanged from before this module
//   existed.
//
// Pure. No React, no store, no localStorage imports — so it can be unit-validated
// under plain node. The only dependency is the canonical stats roll-up, matching
// how tradeUniverse.js builds `stats`.

import { summarizeTradeSanity } from "./tradeClassification";

export const SESSION_PROFILE_VERSION = 1;

// ── Matrix axes ──────────────────────────────────────────────────────────────
// Rows = sessions. Only these five are governed by the matrix. Any trade whose
// session canonicalizes to something else (e.g. "NY PM", or an unknown/blank
// session) is NEVER masked in Phase 1 — it always inherits. This guarantees
// "disabling cohort X removes ONLY cohort X".
export const SESSIONS = [
    { key: "london", label: "London" },
    { key: "lull", label: "London Lull" },
    { key: "newYork", label: "New York" },
    { key: "asia", label: "Asia" },
    { key: "outside", label: "Outside" },
];
export const SESSION_KEYS = SESSIONS.map((s) => s.key);

// Columns = structure × direction cohorts.
export const CELLS = [
    { key: "bos_long", label: "BOS Long", structure: "BOS", direction: "Long" },
    { key: "bos_short", label: "BOS Short", structure: "BOS", direction: "Short" },
    { key: "choch_long", label: "CHoCH Long", structure: "CHoCH", direction: "Long" },
    { key: "choch_short", label: "CHoCH Short", structure: "CHoCH", direction: "Short" },
];
export const CELL_KEYS = CELLS.map((c) => c.key);

// Per-cell state. "inherit" (default) and "enabled" both KEEP the trade in
// Phase 1 (global behavior already decided membership); only "disabled" removes.
// "enabled" is stored distinctly so later phases can attach per-cell rules to it.
export const CELL_STATES = ["inherit", "enabled", "disabled"];

// ── Profile object ───────────────────────────────────────────────────────────
// Shape: { enabled: boolean, cells: { [sessionKey]: { [cellKey]: "enabled"|"disabled" } } }
// Only non-inherit cells are stored; absence means "inherit".

export function emptyProfiles() {
    return { enabled: false, cells: {} };
}

/** Coerce any persisted/loaded value into a clean profile object. Never throws. */
export function normalizeProfiles(raw) {
    if (!raw || typeof raw !== "object") return emptyProfiles();
    const rawCells = raw.cells && typeof raw.cells === "object" ? raw.cells : {};
    const cells = {};
    for (const s of SESSION_KEYS) {
        const row = rawCells[s];
        if (!row || typeof row !== "object") continue;
        const out = {};
        for (const c of CELL_KEYS) {
            const v = row[c];
            if (v === "enabled" || v === "disabled") out[c] = v; // drop "inherit"/junk
        }
        if (Object.keys(out).length) cells[s] = out;
    }
    return { enabled: raw.enabled === true, cells };
}

// ── Canonicalizers ───────────────────────────────────────────────────────────

/**
 * Map an exported session string to a matrix row key, or a non-row sentinel.
 *   "London Killzone"   → "london"
 *   "London Lull"       → "lull"   (checked before "london")
 *   "New York"          → "newYork"
 *   "NY PM"             → "ny_pm"  (no row → always inherits)
 *   "Asia" / "Tokyo"    → "asia"
 *   "Outside"           → "outside"
 *   "" / "—" / unknown  → "unknown" (no row → always inherits)
 */
export function canonicalSession(raw) {
    const s = String(raw || "").trim().toLowerCase();
    if (!s || s === "—") return "unknown";
    if (s.includes("lull")) return "lull";
    if (s.includes("london")) return "london";
    if (/ny\s*pm|new\s*york\s*pm|newyork\s*pm/.test(s)) return "ny_pm";
    if (s.includes("new york") || s.includes("newyork") || /\bny\b/.test(s)) return "newYork";
    if (s.includes("asia") || s.includes("tokyo")) return "asia";
    if (s.includes("outside")) return "outside";
    return "unknown";
}

/** Raw session string off a trade row (importer exposes several aliases). */
export function tradeSessionRaw(trade) {
    return (
        trade?.fillSession
        || trade?.fill_session
        || trade?.session
        || trade?.trade_session
        || trade?.entry_session
        || ""
    );
}

export function canonicalDirection(raw) {
    const d = String(raw || "").trim().toLowerCase();
    if (d.startsWith("s") || d.startsWith("bear") || d === "sell") return "Short";
    return "Long";
}

export function canonicalStructure(raw) {
    return String(raw || "").toUpperCase().includes("CHOCH") ? "CHoCH" : "BOS";
}

/** Trade → cohort cell key, e.g. "bos_long" / "choch_short". */
export function tradeCellKey(trade) {
    const dir = canonicalDirection(trade?.direction ?? trade?.side ?? trade?.dir);
    const str = canonicalStructure(trade?.structure ?? trade?.structure_tag ?? trade?.structureType);
    const d = dir === "Short" ? "short" : "long";
    const s = str === "CHoCH" ? "choch" : "bos";
    return `${s}_${d}`;
}

// ── Lookups ──────────────────────────────────────────────────────────────────

export function resolveCellState(profiles, sessionKey, cellKey) {
    const v = profiles?.cells?.[sessionKey]?.[cellKey];
    return v === "enabled" || v === "disabled" ? v : "inherit";
}

/** Active = enabled AND at least one cell set to "disabled" (Phase 1 only removes). */
export function isProfilesActive(profiles) {
    if (!profiles || profiles.enabled !== true) return false;
    const cells = profiles.cells || {};
    for (const s of Object.keys(cells)) {
        const row = cells[s] || {};
        for (const c of Object.keys(row)) {
            if (row[c] === "disabled") return true;
        }
    }
    return false;
}

/** Count of non-inherit cells (enabled or disabled) — drives the "override count" chip. */
export function countOverrides(profiles) {
    const cells = profiles?.cells || {};
    let n = 0;
    for (const s of Object.keys(cells)) {
        const row = cells[s] || {};
        for (const c of Object.keys(row)) {
            if (row[c] === "enabled" || row[c] === "disabled") n += 1;
        }
    }
    return n;
}

/** True iff this trade falls in a session-row cohort whose cell is "disabled". */
export function isTradeDisabled(trade, profiles) {
    const sess = canonicalSession(tradeSessionRaw(trade));
    if (!SESSION_KEYS.includes(sess)) return false; // non-row session → always inherit
    return resolveCellState(profiles, sess, tradeCellKey(trade)) === "disabled";
}

// ── Main resolver ────────────────────────────────────────────────────────────

/**
 * Mask a resolved TradeUniverse against session profiles.
 *
 * @param {object}  params
 * @param {object}  params.universe   A resolved TradeUniverse (from resolveTradeUniverse).
 * @param {object} [params.scenario]  Scenario object; profiles read from scenario.sessionProfiles.
 * @param {object} [params.profiles]  Explicit profiles (overrides scenario.sessionProfiles).
 * @returns {object} The same universe (byte-identical) when inactive / no removals,
 *                   otherwise a new universe with the disabled cohorts removed.
 */
export function applySessionProfiles({ universe, scenario, profiles } = {}) {
    const p = normalizeProfiles(profiles ?? scenario?.sessionProfiles);
    if (!universe || !isProfilesActive(p)) return universe; // byte-identical

    const src = Array.isArray(universe.trades) ? universe.trades : [];
    const kept = [];
    const removedByCohort = {};
    let removed = 0;

    for (const t of src) {
        if (isTradeDisabled(t, p)) {
            removed += 1;
            const key = `${canonicalSession(tradeSessionRaw(t))}.${tradeCellKey(t)}`;
            removedByCohort[key] = (removedByCohort[key] || 0) + 1;
            continue;
        }
        kept.push(t);
    }

    if (removed === 0) return universe; // nothing matched → byte-identical

    const cohortCount = Object.keys(removedByCohort).length;
    return {
        ...universe,
        label: `${universe.label} · Session profiles`,
        trades: kept,
        stats: summarizeTradeSanity(kept),
        warnings: [
            ...(universe.warnings || []),
            {
                code: "SESSION_PROFILE_MASK",
                message: `Session profiles removed ${removed} trade${removed === 1 ? "" : "s"} across ${cohortCount} cohort${cohortCount === 1 ? "" : "s"}.`,
            },
        ],
        // Attribution for any consumer that wants to show what the matrix did.
        // baseline* are intentionally left untouched so they remain the
        // unmasked reference for Δ-vs-baseline views.
        sessionProfile: {
            active: true,
            removed,
            kept: kept.length,
            removedByCohort,
            overrides: countOverrides(p),
        },
    };
}
