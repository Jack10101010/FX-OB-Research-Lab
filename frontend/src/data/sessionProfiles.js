// sessionProfiles.js — SESSION-STRATEGY-CARDS (Phase 2A).
//
// A FRONTEND-ONLY per-session strategy layer over a resolved TradeUniverse.
// Each session (London / London Lull / New York / NY PM / Asia / Outside) has a
// card with a *default* cohort config plus optional per-cohort overrides
// (BOS Long / BOS Short / CHoCH Long / CHoCH Short). For each cohort a card can:
//   • enable / disable it                                  (MASK — frontend only)
//   • select a different entry model/threshold/arm         (SELECT a pre-exported
//                                                            entry universe; only
//                                                            if that variant exists)
//   • select a break-even cell                             (SELECT an EXACT matrix
//                                                            cell; only if it exists —
//                                                            no replay fallback)
//
// SCOPE (Phase 2A): enable/disable + entry SELECT + BE EXACT SELECT only.
//   • No backend calls, no RR target, no buffers, no protection/FFT, NO replay.
//   • Anything not present in the active run's export resolves to a clear
//     "not available in this export" state — the cohort falls back to its base
//     (inherited) trades and a warning is recorded; nothing is silently faked.
//
// BYTE-IDENTICAL GUARANTEE: when cards are disabled or resolve to no effective
// change, applySessionProfiles() returns the SAME universe object reference.
//
// Pure (no React/store/localStorage). Imports only the EXACT BE-cell finder from
// beResolve (one-way: tradeUniverse → sessionProfiles → beResolve; no cycle).
// Entry-universe selection + canonical-key building are inlined to avoid importing
// tradeUniverse (which imports this module).

import { summarizeTradeSanity } from "./tradeClassification";
import { findBeScenario } from "./beResolve";

export const SESSION_PROFILE_VERSION = 2;

// ── Matrix axes ──────────────────────────────────────────────────────────────
// NY PM is a FIRST-CLASS session (Phase 2A decision): governed like any other.
export const SESSIONS = [
    { key: "london", label: "London" },
    { key: "lull", label: "London Lull" },
    { key: "newYork", label: "New York" },
    { key: "ny_pm", label: "NY PM" },
    { key: "asia", label: "Asia" },
    { key: "outside", label: "Outside" },
];
export const SESSION_KEYS = SESSIONS.map((s) => s.key);

export const CELLS = [
    { key: "bos_long", label: "BOS Long", structure: "BOS", direction: "Long" },
    { key: "bos_short", label: "BOS Short", structure: "BOS", direction: "Short" },
    { key: "choch_long", label: "CHoCH Long", structure: "CHoCH", direction: "Long" },
    { key: "choch_short", label: "CHoCH Short", structure: "CHoCH", direction: "Short" },
];
export const CELL_KEYS = CELLS.map((c) => c.key);

export const ENTRY_MODELS = [
    { key: "baseline", label: "Baseline" },
    { key: "triggered_edge", label: "Triggered Edge" },
    { key: "penetration", label: "Penetration" },
];
// Arm option → exported fill-mode token (TE only). Display uses C0–C6.
export const ARM_OPTIONS = [
    { key: "same", label: "C0 (same)" },
    { key: "next", label: "C1 (next)" },
    { key: "d2", label: "C2" },
    { key: "d3", label: "C3" },
    { key: "d4", label: "C4" },
    { key: "d5", label: "C5" },
    { key: "d6", label: "C6" },
];

// ── Profile object (cards model) ──────────────────────────────────────────────
// {
//   enabled: boolean,
//   cards: {
//     [sessionKey]: {
//       enabled: boolean,                 // session on/off (default true)
//       default: CohortCfg,               // card-level defaults
//       overrides: { [cellKey]: CohortCfg }
//     }
//   }
// }
// CohortCfg = { enabled?: bool, entry?: EntrySel|null, be?: BeSel|null }
//   EntrySel = {model:"baseline"} | {model:"triggered_edge",threshold,arm} | {model:"penetration",threshold}
//   BeSel    = {trigger:"wick"|"close", armR:Number}
// Absent fields = inherit (override ⟶ card default ⟶ base universe).

export function emptyProfiles() {
    return { enabled: false, cards: {} };
}

function normEntrySel(raw) {
    if (!raw || typeof raw !== "object") return null;
    const model = String(raw.model || "").trim();
    if (model === "baseline") return { model: "baseline" };
    if (model === "triggered_edge") {
        const threshold = Number(raw.threshold);
        const arm = String(raw.arm || "").trim();
        if (!Number.isFinite(threshold) || threshold <= 0) return null;
        return { model: "triggered_edge", threshold, arm: arm || "next" };
    }
    if (model === "penetration") {
        const threshold = Number(raw.threshold);
        if (!Number.isFinite(threshold) || threshold <= 0) return null;
        return { model: "penetration", threshold };
    }
    return null;
}

function normBeSel(raw) {
    if (!raw || typeof raw !== "object") return null;
    const trigger = String(raw.trigger || "").trim().toLowerCase();
    const armR = Number(raw.armR);
    if (trigger !== "wick" && trigger !== "close") return null;
    if (!Number.isFinite(armR) || armR <= 0) return null;
    return { trigger, armR };
}

function normCohortCfg(raw) {
    if (!raw || typeof raw !== "object") return {};
    const out = {};
    if (raw.enabled === false || raw.enabled === true) out.enabled = raw.enabled;
    const entry = normEntrySel(raw.entry);
    if (entry) out.entry = entry;
    const be = normBeSel(raw.be);
    if (be) out.be = be;
    return out;
}

/** Coerce any persisted/loaded value into a clean cards object. Accepts the
 *  legacy Phase-1 `{enabled, cells:{[s]:{[c]:"enabled"|"disabled"}}}` shape. */
export function normalizeProfiles(raw) {
    if (!raw || typeof raw !== "object") return emptyProfiles();

    // Legacy Phase-1 shape → cards.
    if (raw.cells && !raw.cards) {
        const cards = {};
        for (const s of SESSION_KEYS) {
            const row = raw.cells[s];
            if (!row || typeof row !== "object") continue;
            const overrides = {};
            for (const c of CELL_KEYS) {
                if (row[c] === "disabled") overrides[c] = { enabled: false };
                else if (row[c] === "enabled") overrides[c] = { enabled: true };
            }
            if (Object.keys(overrides).length) cards[s] = { enabled: true, default: {}, overrides };
        }
        return { enabled: raw.enabled === true, cards };
    }

    const rawCards = raw.cards && typeof raw.cards === "object" ? raw.cards : {};
    const cards = {};
    for (const s of SESSION_KEYS) {
        const card = rawCards[s];
        if (!card || typeof card !== "object") continue;
        const overrides = {};
        const rawOv = card.overrides && typeof card.overrides === "object" ? card.overrides : {};
        for (const c of CELL_KEYS) {
            const cfg = normCohortCfg(rawOv[c]);
            if (Object.keys(cfg).length) overrides[c] = cfg;
        }
        const def = normCohortCfg(card.default);
        const enabled = card.enabled === false ? false : true;
        // Keep a card only if it carries any signal.
        if (enabled === false || Object.keys(def).length || Object.keys(overrides).length) {
            cards[s] = { enabled, default: def, overrides };
        }
    }
    return { enabled: raw.enabled === true, cards };
}

// ── Canonicalizers ───────────────────────────────────────────────────────────

/** Map an exported session string to a matrix row key (NY PM is first-class). */
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

export function tradeCellKey(trade) {
    const dir = canonicalDirection(trade?.direction ?? trade?.side ?? trade?.dir);
    const str = canonicalStructure(trade?.structure ?? trade?.structure_tag ?? trade?.structureType);
    const d = dir === "Short" ? "short" : "long";
    const s = str === "CHoCH" ? "choch" : "bos";
    return `${s}_${d}`;
}

/** Cohort key "session|cell", e.g. "ny_pm|bos_short". */
export function cohortOf(trade) {
    return `${canonicalSession(tradeSessionRaw(trade))}|${tradeCellKey(trade)}`;
}

// ── Entry-key building + universe selection (inlined; mirrors tradeUniverse) ───

function thresholdToKeyPart(n) {
    if (n == null || !isFinite(Number(n))) return null;
    const num = Number(n);
    const intPart = Math.floor(num);
    const fracPart = Math.round((num - intPart) * 100);
    if (fracPart === 0) return `${intPart}p0`;
    if (fracPart % 10 === 0) return `${intPart}p${fracPart / 10}`;
    return `${intPart}p${fracPart}`;
}

/** Arm token → exported fill-mode ("same"/"next"/"d2".."d6"). */
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

/** EntrySel → canonical entry_model_key, or null if malformed. */
export function buildEntryKey(entry) {
    if (!entry || !entry.model || entry.model === "baseline") return "baseline";
    const tp = thresholdToKeyPart(entry.threshold);
    if (!tp) return null;
    if (entry.model === "triggered_edge") {
        const fm = armToFillMode(entry.arm);
        return fm ? `entry_triggered_edge_${tp}_${fm}` : `entry_triggered_edge_${tp}`;
    }
    if (entry.model === "penetration") return `entry_penetration_${tp}`;
    return null;
}

/** Base universe's entry key, derived from its resolved scenario. */
export function entryKeyFromScenario(scn) {
    const fam = scn?.family;
    if (!fam || fam === "baseline") return "baseline";
    const tp = thresholdToKeyPart(scn.threshold);
    if (!tp) return "baseline";
    const fm = scn.fillMode;
    const base = `entry_${fam}_${tp}`;
    if (fm === "same" || fm === "next" || (typeof fm === "string" && /^d\d+$/.test(fm))) return `${base}_${fm}`;
    return base;
}

function entryTradesByModeLocal(bundle) {
    const r = bundle?.entryResults || bundle?.entry_results || bundle?.summary?.entryResults || {};
    const raw = r?.tradesByMode || r?.trades_by_mode || {};
    return raw && typeof raw === "object" ? raw : {};
}

/** Trade list for an entry_model_key, or null if that variant isn't exported. */
export function entryUniverseTrades(bundle, key) {
    const map = entryTradesByModeLocal(bundle);
    if (key === "baseline") {
        const b = map.entry_baseline || map.baseline;
        return Array.isArray(b) ? b : null;
    }
    const v = map[key];
    return Array.isArray(v) ? v : null;
}

/** Sorted list of entry_model_key strings present in the run (for availability UI). */
export function listAvailableEntryKeys(bundle) {
    const map = entryTradesByModeLocal(bundle);
    const keys = new Set(["baseline"]);
    for (const k of Object.keys(map)) {
        if (k === "entry_baseline") { keys.add("baseline"); continue; }
        if (Array.isArray(map[k]) && map[k].length >= 0) keys.add(k);
    }
    return [...keys];
}

/** EXACT BE-cell trades for (variant, entryKey, be), or null if the cell isn't exported. */
export function beCellTrades(bundle, variant, entryKey, be) {
    if (!be) return null;
    const ev = entryKey === "baseline" ? null : entryKey;
    const res = findBeScenario(bundle?.beResults, bundle?.beTradesByMode, {
        executionMode: variant,
        entryVariantKey: ev,
        triggerBasis: be.trigger,
        armLevelR: be.armR,
    });
    return res && Array.isArray(res.trades) ? res.trades : null;
}

// ── Availability helpers (UI) ─────────────────────────────────────────────────

export function entryAvailable(bundle, entry) {
    if (!entry) return true; // inherit
    const key = buildEntryKey(entry);
    if (!key) return false;
    return entryUniverseTrades(bundle, key) != null;
}

export function beAvailable(bundle, variant, entryKey, be) {
    if (!be) return true; // inherit / none
    return beCellTrades(bundle, variant, entryKey, be) != null;
}

// ── Cohort config resolution ──────────────────────────────────────────────────

/** Resolve a cohort: override ⟶ card default ⟶ inherit. */
export function resolveCohortConfig(profiles, sessionKey, cellKey) {
    const card = profiles?.cards?.[sessionKey];
    if (!card) return { disabled: false, entry: null, be: null };
    if (card.enabled === false) return { disabled: true, entry: null, be: null };
    const ov = card.overrides?.[cellKey] || {};
    const def = card.default || {};
    const enabled = ov.enabled ?? def.enabled ?? true;
    if (enabled === false) return { disabled: true, entry: null, be: null };
    return {
        disabled: false,
        entry: ov.entry ?? def.entry ?? null,
        be: ov.be ?? def.be ?? null,
    };
}

/** Active = enabled AND at least one cohort resolves to a real change. */
export function isProfilesActive(profiles) {
    if (!profiles || profiles.enabled !== true) return false;
    for (const s of SESSION_KEYS) {
        for (const c of CELL_KEYS) {
            const cfg = resolveCohortConfig(profiles, s, c);
            if (cfg.disabled || cfg.entry || cfg.be) return true;
        }
    }
    return false;
}

/** Count of cohorts that resolve to a non-inherit state (for the override chip). */
export function countOverrides(profiles) {
    let n = 0;
    for (const s of SESSION_KEYS) {
        for (const c of CELL_KEYS) {
            const cfg = resolveCohortConfig(profiles, s, c);
            if (cfg.disabled || cfg.entry || cfg.be) n += 1;
        }
    }
    return n;
}

// ── Main resolver ────────────────────────────────────────────────────────────

/**
 * Resolve a TradeUniverse against the session cards.
 *
 * @param {object}  params
 * @param {object}  params.universe   Resolved base TradeUniverse.
 * @param {object} [params.scenario]  Scenario (profiles read from scenario.sessionProfiles).
 * @param {object} [params.profiles]  Explicit profiles (overrides scenario.sessionProfiles).
 * @param {object} [params.bundle]    Run bundle — required for entry/BE SELECT.
 * @param {string} [params.variant]   Execution/position variant (for BE lookup).
 * @returns {object} Same universe (byte-identical) when inactive, else a new one.
 */
export function applySessionProfiles({ universe, scenario, profiles, bundle = null, variant = null } = {}) {
    const cards = normalizeProfiles(profiles ?? scenario?.sessionProfiles);
    if (!universe || !isProfilesActive(cards)) return universe; // byte-identical

    const base = Array.isArray(universe.trades) ? universe.trades : [];
    const baseEntryKey = entryKeyFromScenario(universe.scenario || scenario || {});
    const execMode = variant || universe.variant || null;

    // Group base trades by cohort.
    const baseByCohort = new Map();
    for (const t of base) {
        const ck = cohortOf(t);
        if (!baseByCohort.has(ck)) baseByCohort.set(ck, []);
        baseByCohort.get(ck).push(t);
    }

    // Governed cohorts that need replacement (disabled, or entry/BE override).
    const replace = new Map(); // "session|cell" -> cfg
    for (const s of SESSION_KEYS) {
        for (const c of CELL_KEYS) {
            const cfg = resolveCohortConfig(cards, s, c);
            if (cfg.disabled || cfg.entry || cfg.be) replace.set(`${s}|${c}`, cfg);
        }
    }

    const result = [];
    // Keep untouched cohorts as-is (covers ungoverned sessions + inherited cohorts).
    for (const [ck, list] of baseByCohort) {
        if (!replace.has(ck)) { for (const t of list) result.push(t); }
    }

    const warnings = [...(universe.warnings || [])];
    const attr = {
        active: true, removed: 0, swapped: 0, beApplied: 0,
        removedByCohort: {}, unavailable: [],
    };
    const belongs = (t, ck) => cohortOf(t) === ck;

    for (const [ck, cfg] of replace) {
        if (cfg.disabled) {
            const n = (baseByCohort.get(ck) || []).length;
            attr.removed += n;
            if (n) attr.removedByCohort[ck] = n;
            continue;
        }
        const entryKey = cfg.entry ? buildEntryKey(cfg.entry) : baseEntryKey;
        let list = baseByCohort.get(ck) || [];
        let entryUnavailable = false;

        if (cfg.entry) {
            const uni = bundle ? entryUniverseTrades(bundle, entryKey) : null;
            if (!uni) {
                entryUnavailable = true;
                attr.unavailable.push({ cohort: ck, kind: "entry", key: entryKey });
                warnings.push({ code: "SESSION_CARD_ENTRY_UNAVAILABLE", message: `Entry variant "${entryKey}" not in this export for ${ck}; kept base trades.` });
                // fallback: keep base trades (inherit) — never fabricate
            } else {
                list = uni.filter((t) => belongs(t, ck));
                attr.swapped += list.length;
            }
        }

        if (cfg.be && !entryUnavailable) {
            const cell = bundle ? beCellTrades(bundle, execMode, entryKey, cfg.be) : null;
            if (cell) {
                list = cell.filter((t) => belongs(t, ck));
                attr.beApplied += list.length;
            } else {
                attr.unavailable.push({ cohort: ck, kind: "be", entryKey, be: cfg.be });
                warnings.push({ code: "SESSION_CARD_BE_UNAVAILABLE", message: `Exact BE cell not in this export for ${ck} (${entryKey}); kept entry trades (no replay).` });
                // no replay — keep `list` as-is
            }
        }

        for (const t of list) result.push(t);
    }

    const changed = attr.removed || attr.swapped || attr.beApplied || attr.unavailable.length;
    if (!changed) return universe; // defensive: nothing actually applied → byte-identical

    const removedCohorts = Object.keys(attr.removedByCohort).length;
    if (attr.removed) {
        warnings.push({
            code: "SESSION_CARD_MASK",
            message: `Session cards removed ${attr.removed} trade${attr.removed === 1 ? "" : "s"} across ${removedCohorts} cohort${removedCohorts === 1 ? "" : "s"}.`,
        });
    }

    return {
        ...universe,
        label: `${universe.label} · Session cards`,
        trades: result,
        stats: summarizeTradeSanity(result),
        warnings,
        // baseline* left untouched as the unmasked reference.
        sessionCards: attr,
        // Back-compat attribution alias (Phase 1 consumers read sessionProfile).
        sessionProfile: { active: true, removed: attr.removed, removedByCohort: attr.removedByCohort, overrides: countOverrides(cards) },
    };
}
