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

// ── Portfolio object (2A.1 — named-profile model) ──────────────────────────────
// {
//   enabled: boolean,
//   globalDefaultRef: { entry: id|null, be: id|null },   // inheritance root
//   profiles: {                                          // named, reusable, pair-agnostic
//     entry: { [id]: EntrySel },                         // always seeds "entry_baseline"
//     be:    { [id]: BeSel },
//   },
//   control: { baselineProfileRef: id },                 // research control (panel-local)
//   cards: {
//     [sessionKey]: {
//       enabled: boolean,                                // session on/off (default true)
//       default: CohortRef,                              // card-level defaults
//       overrides: { [cellKey]: CohortRef },
//     }
//   }
// }
// CohortRef = { enabled?: bool, entryRef?: id, beRef?: id }   (absent ref = inherit up)
//   EntrySel = {model:"baseline"} | {model:"triggered_edge",threshold,arm} | {model:"penetration",threshold}
//   BeSel    = {trigger:"wick"|"close", armR:Number}
//
// Inheritance: cohort override ⟶ card default ⟶ globalDefaultRef ⟶ (none = base universe).
// All settings are pair-agnostic; availability is resolved against the active
// bundle (the selected pair's export). Legacy Phase-1 `cells` and Phase-2A inline
// `entry`/`be` are auto-migrated to deterministic profile refs on normalize.

export const BASELINE_ENTRY_ID = "entry_baseline";

export function emptyProfiles() {
    return {
        enabled: false,
        globalDefaultRef: { entry: null, be: null, target: null },
        profiles: { entry: { [BASELINE_ENTRY_ID]: { model: "baseline" } }, be: {}, target: {} },
        control: { baselineProfileRef: BASELINE_ENTRY_ID },
        cards: {},
    };
}

// ── Named-profile identity + labels ────────────────────────────────────────────

/** Numeric token for ids/labels: 25 → "25", 0.5 → "0p5", 3.3 → "3p3". */
function numTok(n) {
    const v = Number(n);
    if (!Number.isFinite(v)) return "x";
    return v % 1 === 0 ? String(v) : String(v).replace(".", "p");
}

/** Deterministic id for an entry profile (so identical settings dedupe). */
export function entryProfileId(sel) {
    if (!sel || !sel.model) return null;
    if (sel.model === "baseline") return BASELINE_ENTRY_ID;
    if (sel.model === "triggered_edge") return `entry_te_${numTok(sel.threshold)}_${sel.arm}`;
    if (sel.model === "penetration") return `entry_pen_${numTok(sel.threshold)}`;
    return null;
}
export function beProfileId(sel) {
    if (!sel) return null;
    return `be_${sel.trigger}_${numTok(sel.armR)}`;
}

const ARM_LABEL = { same: "C0", next: "C1", d2: "C2", d3: "C3", d4: "C4", d5: "C5", d6: "C6" };
export function entryProfileLabel(sel) {
    if (!sel) return "—";
    if (sel.model === "baseline") return "Baseline";
    if (sel.model === "triggered_edge") return `TE ${sel.threshold}% · ${ARM_LABEL[sel.arm] || sel.arm}`;
    if (sel.model === "penetration") return `Pen ${sel.threshold}%`;
    return "—";
}
export function beProfileLabel(sel) {
    if (!sel) return "None";
    return `BE ${sel.armR}R ${sel.trigger}`;
}

// ── Profile library CRUD (pure; return a new portfolio object) ──────────────────
export function listEntryProfiles(profiles) {
    const map = profiles?.profiles?.entry || {};
    return Object.keys(map).map((id) => ({ id, sel: map[id], label: entryProfileLabel(map[id]) }));
}
export function listBeProfiles(profiles) {
    const map = profiles?.profiles?.be || {};
    return Object.keys(map).map((id) => ({ id, sel: map[id], label: beProfileLabel(map[id]) }));
}
export function addEntryProfile(profiles, sel) {
    const clean = normEntrySel(sel);
    if (!clean) return profiles;
    const id = entryProfileId(clean);
    return { ...profiles, profiles: { ...profiles.profiles, entry: { ...profiles.profiles.entry, [id]: clean } } };
}
export function addBeProfile(profiles, sel) {
    const clean = normBeSel(sel);
    if (!clean) return profiles;
    const id = beProfileId(clean);
    return { ...profiles, profiles: { ...profiles.profiles, be: { ...profiles.profiles.be, [id]: clean } } };
}
export function removeProfile(profiles, kind, id) {
    if (kind === "entry" && id === BASELINE_ENTRY_ID) return profiles; // baseline is permanent
    const next = { ...profiles.profiles, [kind]: { ...profiles.profiles[kind] } };
    delete next[kind][id];
    return { ...profiles, profiles: next };
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

// ── Target profiles (2B.1b) — RR targets only; no time-horizon targets ──────────
function normTargetSel(raw) {
    if (!raw || typeof raw !== "object") return null;
    if (String(raw.type || "rr").toLowerCase() !== "rr") return null; // RR only
    const value = Number(raw.value);
    if (!Number.isFinite(value) || value <= 0) return null;
    return { type: "rr", value };
}
/** Deterministic id; token MUST match the backend rr_token (1.0→"1", 3.3→"3p3"). */
export function targetProfileId(sel) {
    const clean = normTargetSel(sel);
    return clean ? `target_rr_${numTok(clean.value)}` : null;
}
export function targetProfileLabel(sel) {
    if (!sel || sel.value == null) return "None";
    return `${sel.value}R`;
}
export function listTargetProfiles(profiles) {
    const map = profiles?.profiles?.target || {};
    return Object.keys(map).map((id) => ({ id, sel: map[id], label: targetProfileLabel(map[id]) }));
}
export function addTargetProfile(profiles, sel) {
    const clean = normTargetSel(sel);
    if (!clean) return profiles;
    const id = targetProfileId(clean);
    return { ...profiles, profiles: { ...profiles.profiles, target: { ...(profiles.profiles?.target || {}), [id]: clean } } };
}
export function removeTargetProfile(profiles, id) {
    return removeProfile(profiles, "target", id);
}

// ── Scenario write helpers (Phase 2 — trader-facing editing) ────────────────────
// Pure, immutable: every helper returns a NEW normalized portfolio and never
// mutates its input. A `selection` is a raw sel ({model,…} / {trigger,armR} /
// {type:"rr",value}); `null` clears that dimension at that level (→ inherit /
// global / run default). Named profiles are auto-created/reused via the
// deterministic-id helpers, so identical selections share one profile. These are
// the single write layer for SessionScenarioBuilder — no UI/library imports.

const _DIM_REF = { entry: "entryRef", be: "beRef", target: "targetRef" };

// Ensure a profile exists for (dim, sel) and return its ref id. sel null → ref null.
function _ensureProfileRef(profiles, dim, sel) {
    if (sel == null) return { profiles, ref: null };
    if (dim === "entry") { const c = normEntrySel(sel); if (!c) return { profiles, ref: null }; return { profiles: addEntryProfile(profiles, c), ref: entryProfileId(c) }; }
    if (dim === "be") { const c = normBeSel(sel); if (!c) return { profiles, ref: null }; return { profiles: addBeProfile(profiles, c), ref: beProfileId(c) }; }
    if (dim === "target") { const c = normTargetSel(sel); if (!c) return { profiles, ref: null }; return { profiles: addTargetProfile(profiles, c), ref: targetProfileId(c) }; }
    return { profiles, ref: null };
}

function _cloneCard(profiles, sessionKey) {
    const prev = profiles?.cards?.[sessionKey];
    return { enabled: prev?.enabled !== false, default: { ...(prev?.default || {}) }, overrides: { ...(prev?.overrides || {}) } };
}

function _applyRef(slot, dim, ref) {
    const key = _DIM_REF[dim];
    const next = { ...slot };
    if (ref == null) delete next[key]; else next[key] = ref;
    return next;
}

/** True when nothing deviates from global: no per-cohort overrides, no whole-
 *  session disables, no session-level defaults. (The "Use Global for all" state.) */
export function isAllGlobal(profiles) {
    if (countOverrides(profiles) !== 0) return false;
    const cards = profiles?.cards || {};
    for (const s of SESSION_KEYS) {
        const card = cards[s];
        if (!card) continue;
        if (card.enabled === false) return false;
        const d = card.default || {};
        if (d.entryRef || d.beRef || d.targetRef) return false;
    }
    return true;
}

/** Master on/off for the whole scenario overlay. */
export function setScenarioEnabled(profiles, enabled) {
    return normalizeProfiles({ ...profiles, enabled: !!enabled });
}

/** Set/clear a Global default dimension. dim ∈ {entry,be,target}; sel|null. */
export function setGlobalDefaultValue(profiles, dim, sel) {
    if (!_DIM_REF[dim]) return normalizeProfiles(profiles);
    const { profiles: p, ref } = _ensureProfileRef(profiles, dim, sel);
    const gd = { ...(p.globalDefaultRef || { entry: null, be: null, target: null }) };
    gd[dim] = ref; // globalDefaultRef keys are entry/be/target (not *Ref)
    return normalizeProfiles({ ...p, globalDefaultRef: gd });
}

/** Set/clear a Session-level default dimension. */
export function setSessionDefaultValue(profiles, sessionKey, dim, sel) {
    if (!_DIM_REF[dim] || !SESSION_KEYS.includes(sessionKey)) return normalizeProfiles(profiles);
    const { profiles: p, ref } = _ensureProfileRef(profiles, dim, sel);
    const card = _cloneCard(p, sessionKey);
    card.default = _applyRef(card.default, dim, ref);
    return normalizeProfiles({ ...p, cards: { ...(p.cards || {}), [sessionKey]: card } });
}

/** Set/clear a per-cohort dimension override. */
export function setCohortValue(profiles, sessionKey, cellKey, dim, sel) {
    if (!_DIM_REF[dim] || !SESSION_KEYS.includes(sessionKey) || !CELL_KEYS.includes(cellKey)) return normalizeProfiles(profiles);
    const { profiles: p, ref } = _ensureProfileRef(profiles, dim, sel);
    const card = _cloneCard(p, sessionKey);
    card.overrides = { ...card.overrides, [cellKey]: _applyRef(card.overrides[cellKey] || {}, dim, ref) };
    return normalizeProfiles({ ...p, cards: { ...(p.cards || {}), [sessionKey]: card } });
}

/** Set a per-cohort enable state. enabled ∈ {true,false,null}; null = inherit. */
export function setCohortEnabled(profiles, sessionKey, cellKey, enabled) {
    if (!SESSION_KEYS.includes(sessionKey) || !CELL_KEYS.includes(cellKey)) return normalizeProfiles(profiles);
    const card = _cloneCard(profiles, sessionKey);
    const slot = { ...(card.overrides[cellKey] || {}) };
    if (enabled === true || enabled === false) slot.enabled = enabled; else delete slot.enabled;
    card.overrides = { ...card.overrides, [cellKey]: slot };
    return normalizeProfiles({ ...profiles, cards: { ...(profiles.cards || {}), [sessionKey]: card } });
}

/** Clear a cohort's entire override (entry/be/target/enabled) → back to inherit. */
export function resetCohort(profiles, sessionKey, cellKey) {
    if (!SESSION_KEYS.includes(sessionKey) || !CELL_KEYS.includes(cellKey)) return normalizeProfiles(profiles);
    const card = _cloneCard(profiles, sessionKey);
    const overrides = { ...card.overrides };
    delete overrides[cellKey];
    card.overrides = overrides;
    return normalizeProfiles({ ...profiles, cards: { ...(profiles.cards || {}), [sessionKey]: card } });
}

/** Reset every session/cohort to the Global settings (clears all cards). Keeps
 *  the Global defaults, the named-profile library and the master enable flag. */
export function resetAllToGlobal(profiles) {
    return normalizeProfiles({ ...profiles, cards: {} });
}

/**
 * Coerce any persisted/loaded value into a clean named-profile portfolio object.
 * Migrates BOTH legacy shapes deterministically (no data loss, no surprises):
 *   • Phase-1 `{enabled, cells:{[s]:{[c]:"enabled"|"disabled"}}}`
 *   • Phase-2A inline `{enabled, cards:{[s]:{default,overrides:{[c]:{entry,be}}}}}`
 * Inline `entry`/`be` objects are auto-hoisted into the named library with their
 * deterministic id and replaced by `entryRef`/`beRef`.
 */
export function normalizeProfiles(raw) {
    if (!raw || typeof raw !== "object") return emptyProfiles();

    const out = emptyProfiles(); // seeds baseline entry profile + empty defaults

    // 1. Seed the named library from any provided `profiles` map (validated).
    const seed = (kind, normFn) => {
        const src = raw.profiles?.[kind];
        if (src && typeof src === "object") {
            for (const id of Object.keys(src)) {
                const clean = normFn(src[id]);
                if (clean) out.profiles[kind][id] = clean;
            }
        }
    };
    seed("entry", normEntrySel);
    seed("be", normBeSel);
    seed("target", normTargetSel);

    // Hoist an inline sel into the library, returning its id (or null).
    const hoistEntry = (sel) => { const c = normEntrySel(sel); if (!c) return null; const id = entryProfileId(c); out.profiles.entry[id] = c; return id; };
    const hoistBe = (sel) => { const c = normBeSel(sel); if (!c) return null; const id = beProfileId(c); out.profiles.be[id] = c; return id; };
    const hoistTarget = (sel) => { const c = normTargetSel(sel); if (!c) return null; const id = targetProfileId(c); out.profiles.target[id] = c; return id; };

    // Resolve a slot's entry/be/target into a library ref: prefer inline (hoist),
    // else a valid ref string. Dangling refs are dropped on the final pass below.
    const refsFor = (obj) => {
        const r = {};
        if (obj && typeof obj === "object") {
            if (obj.entry) { const id = hoistEntry(obj.entry); if (id) r.entryRef = id; }
            else if (typeof obj.entryRef === "string") r.entryRef = obj.entryRef;
            if (obj.be) { const id = hoistBe(obj.be); if (id) r.beRef = id; }
            else if (typeof obj.beRef === "string") r.beRef = obj.beRef;
            if (obj.target) { const id = hoistTarget(obj.target); if (id) r.targetRef = id; }
            else if (typeof obj.targetRef === "string") r.targetRef = obj.targetRef;
            if (obj.enabled === false || obj.enabled === true) r.enabled = obj.enabled;
        }
        return r;
    };

    // 2. Global default — canonical `globalDefaultRef:{entry,be,target}` (id strings),
    //    or legacy inline `globalDefault:{entry,be,target}` (hoisted).
    let gdEntry = null, gdBe = null, gdTarget = null;
    const rawGd = raw.globalDefaultRef;
    if (rawGd && typeof rawGd === "object") {
        if (typeof rawGd.entry === "string") gdEntry = rawGd.entry;
        if (typeof rawGd.be === "string") gdBe = rawGd.be;
        if (typeof rawGd.target === "string") gdTarget = rawGd.target;
    }
    const legacyGd = raw.globalDefault;
    if (legacyGd && typeof legacyGd === "object") {
        if (legacyGd.entry) { const id = hoistEntry(legacyGd.entry); if (id) gdEntry = id; }
        if (legacyGd.be) { const id = hoistBe(legacyGd.be); if (id) gdBe = id; }
        if (legacyGd.target) { const id = hoistTarget(legacyGd.target); if (id) gdTarget = id; }
    }
    out.globalDefaultRef = { entry: gdEntry, be: gdBe, target: gdTarget };

    // 3. Cards.
    if (raw.cells && !raw.cards) {
        // Phase-1 cells → enable/disable overrides.
        for (const s of SESSION_KEYS) {
            const row = raw.cells[s];
            if (!row || typeof row !== "object") continue;
            const overrides = {};
            for (const c of CELL_KEYS) {
                if (row[c] === "disabled") overrides[c] = { enabled: false };
                else if (row[c] === "enabled") overrides[c] = { enabled: true };
            }
            if (Object.keys(overrides).length) out.cards[s] = { enabled: true, default: {}, overrides };
        }
    } else {
        const rawCards = raw.cards && typeof raw.cards === "object" ? raw.cards : {};
        for (const s of SESSION_KEYS) {
            const card = rawCards[s];
            if (!card || typeof card !== "object") continue;
            const overrides = {};
            const rawOv = card.overrides && typeof card.overrides === "object" ? card.overrides : {};
            for (const c of CELL_KEYS) {
                const cfg = refsFor(rawOv[c]);
                if (Object.keys(cfg).length) overrides[c] = cfg;
            }
            const def = refsFor(card.default);
            const enabled = card.enabled === false ? false : true;
            if (enabled === false || Object.keys(def).length || Object.keys(overrides).length) {
                out.cards[s] = { enabled, default: def, overrides };
            }
        }
    }

    // 4. Control ref (default baseline; must exist in the library).
    const cRef = raw.control?.baselineProfileRef;
    out.control = { baselineProfileRef: (cRef && out.profiles.entry[cRef]) ? cRef : BASELINE_ENTRY_ID };

    // 5. Drop dangling refs (point at a profile that doesn't exist → inherit).
    const validEntry = (id) => id && out.profiles.entry[id] ? id : null;
    const validBe = (id) => id && out.profiles.be[id] ? id : null;
    const validTarget = (id) => id && out.profiles.target[id] ? id : null;
    out.globalDefaultRef.entry = validEntry(out.globalDefaultRef.entry);
    out.globalDefaultRef.be = validBe(out.globalDefaultRef.be);
    out.globalDefaultRef.target = validTarget(out.globalDefaultRef.target);
    for (const s of Object.keys(out.cards)) {
        const card = out.cards[s];
        const fix = (slot) => {
            if ("entryRef" in slot && !validEntry(slot.entryRef)) delete slot.entryRef;
            if ("beRef" in slot && !validBe(slot.beRef)) delete slot.beRef;
            if ("targetRef" in slot && !validTarget(slot.targetRef)) delete slot.targetRef;
        };
        fix(card.default);
        for (const c of Object.keys(card.overrides)) fix(card.overrides[c]);
    }

    out.enabled = raw.enabled === true;
    return out;
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

// Target available when the run exported it: its token is in bundle.targetSet.
export function targetAvailable(bundle, sel) {
    if (!sel) return true; // no target → uses the run's baked target
    const set = bundle?.targetSet;
    if (!Array.isArray(set) || !set.length) return false;
    const tok = numTok(sel.value);
    return set.some((v) => numTok(v) === tok);
}

export function beAvailable(bundle, variant, entryKey, be) {
    if (!be) return true; // inherit / none
    return beCellTrades(bundle, variant, entryKey, be) != null;
}

// ── Cohort config resolution ──────────────────────────────────────────────────

/** Look up a ref in the named library → EntrySel/BeSel (or null). */
function lookupEntry(profiles, ref) { return ref ? (profiles?.profiles?.entry?.[ref] || null) : null; }
function lookupBe(profiles, ref) { return ref ? (profiles?.profiles?.be?.[ref] || null) : null; }
function lookupTarget(profiles, ref) { return ref ? (profiles?.profiles?.target?.[ref] || null) : null; }

// Ref-field provenance shape: { ref, sel, source, explicit, inherited }.
function refField(ref, sel, source, explicit) {
    return { ref: sel ? ref : null, sel, source, explicit, inherited: !explicit && sel != null };
}
const NONE_REF = () => ({ ref: null, sel: null, source: "none", explicit: false, inherited: false });

/**
 * SHARED resolution chain (single source of truth for resolveCohortConfig AND
 * resolveCohortProvenance). Mirrors the inheritance order exactly:
 *   enable:  card.enabled===false ⟶ ov.enabled ⟶ def.enabled ⟶ default-on
 *   ref:     cohort override ⟶ card default ⟶ globalDefaultRef ⟶ none
 * Baseline Control (profiles.control) is intentionally NOT read here — it is a
 * comparison reference, never part of inheritance.
 *
 * @returns {{
 *   cohort: string, disabled: boolean,
 *   enable: { value: boolean, source: "default-on"|"cohort"|"session-default"|"session-disabled" },
 *   entry:  { ref, sel, source: "cohort"|"session-default"|"global-default"|"none", explicit, inherited },
 *   be:     { ...same shape... },
 * }}
 */
function _resolveCohortChain(profiles, sessionKey, cellKey) {
    const cohort = `${sessionKey}|${cellKey}`;
    const gd = profiles?.globalDefaultRef || {};
    const card = profiles?.cards?.[sessionKey];

    // ── enable ────────────────────────────────────────────────────────────────
    let enable;
    if (card && card.enabled === false) {
        enable = { value: false, source: "session-disabled" };
    } else {
        const ov = card?.overrides?.[cellKey] || {};
        const def = card?.default || {};
        if (ov.enabled === true || ov.enabled === false) enable = { value: ov.enabled, source: "cohort" };
        else if (def.enabled === true || def.enabled === false) enable = { value: def.enabled, source: "session-default" };
        else enable = { value: true, source: "default-on" };
    }
    if (!enable.value) {
        return { cohort, disabled: true, enable, entry: NONE_REF(), be: NONE_REF(), target: NONE_REF() };
    }

    // ── refs (enabled cohorts only) ─────────────────────────────────────────────
    const ov = card?.overrides?.[cellKey] || {};
    const def = card?.default || {};
    const resolveRef = (lookup, ovRef, defRef, gdRef) => {
        if (ovRef) { const sel = lookup(profiles, ovRef); if (sel) return refField(ovRef, sel, "cohort", true); }
        if (defRef) { const sel = lookup(profiles, defRef); if (sel) return refField(defRef, sel, "session-default", false); }
        if (gdRef) { const sel = lookup(profiles, gdRef); if (sel) return refField(gdRef, sel, "global-default", false); }
        return NONE_REF();
    };
    const entry = resolveRef(lookupEntry, ov.entryRef, def.entryRef, gd.entry);
    const be = resolveRef(lookupBe, ov.beRef, def.beRef, gd.be);
    const target = resolveRef(lookupTarget, ov.targetRef, def.targetRef, gd.target);
    return { cohort, disabled: false, enable, entry, be, target };
}

/**
 * Resolve a cohort through the ref chain: cohort override ⟶ card default ⟶
 * globalDefaultRef ⟶ none. PUBLIC return shape is unchanged (adapter over
 * _resolveCohortChain) — resolver + availability keep using `cfg.entry`/`cfg.be`.
 */
export function resolveCohortConfig(profiles, sessionKey, cellKey) {
    const chain = _resolveCohortChain(profiles, sessionKey, cellKey);
    if (chain.disabled) return { disabled: true, entry: null, be: null, target: null, entryRef: null, beRef: null, targetRef: null };
    return {
        disabled: false,
        entry: chain.entry.sel,
        be: chain.be.sel,
        target: chain.target.sel,
        entryRef: chain.entry.ref,
        beRef: chain.be.ref,
        targetRef: chain.target.ref,
    };
}

/**
 * Provenance for a cohort — what runs, set vs inherited, and the source level.
 * Pure; assumes a normalized portfolio. Does NOT read Baseline Control.
 */
export function resolveCohortProvenance(profiles, sessionKey, cellKey) {
    return _resolveCohortChain(profiles, sessionKey, cellKey);
}

/**
 * Per-cohort availability against the ACTIVE bundle (the selected pair's export).
 * Pair-aware via the bundle only; config stays pair-agnostic.
 *
 * @returns {{ cohort, entry:{status,ref,key}, be:{status,ref,key} }}
 *   status: "available" | "unavailable" | "na"  ("na" = disabled or no profile/base)
 */
export function resolveCohortAvailability(profiles, bundle, variant, sessionKey, cellKey) {
    const chain = _resolveCohortChain(profiles, sessionKey, cellKey);
    const cohort = chain.cohort;
    if (chain.disabled) {
        return {
            cohort,
            entry: { status: "na", ref: null, key: null },
            be: { status: "na", ref: null, key: null },
            target: { status: "na", ref: null, token: null },
        };
    }
    const entrySel = chain.entry.sel;
    const beSel = chain.be.sel;
    const targetSel = chain.target.sel;
    const entryKey = entrySel ? buildEntryKey(entrySel) : "baseline";

    const entryAv = entrySel
        ? { status: entryAvailable(bundle, entrySel) ? "available" : "unavailable", ref: chain.entry.ref, key: entryKey }
        : { status: "na", ref: null, key: null };

    const beAv = beSel
        ? { status: beAvailable(bundle, variant, entryKey, beSel) ? "available" : "unavailable", ref: chain.be.ref, key: entryKey }
        : { status: "na", ref: null, key: null };

    const targetAv = targetSel
        ? { status: targetAvailable(bundle, targetSel) ? "available" : "unavailable", ref: chain.target.ref, token: numTok(targetSel.value) }
        : { status: "na", ref: null, token: null };

    return { cohort, entry: entryAv, be: beAv, target: targetAv };
}

/** Active pair label from the bundle (pair-agnostic config; never stored). */
function pairFromBundle(bundle) {
    return bundle?.symbol || bundle?.runSummary?.symbol || bundle?.config?.symbol || null;
}

/**
 * Effective portfolio map: provenance + availability + a human-facing `effective`
 * summary for every session × cohort, plus the active pair label and stable order.
 * Pure; composes the two per-cohort functions. No backend, no replay.
 */
export function buildEffectivePortfolioMap(profiles, bundle, variant) {
    const cells = {};
    for (const s of SESSION_KEYS) {
        for (const c of CELL_KEYS) {
            const provenance = _resolveCohortChain(profiles, s, c);
            const availability = resolveCohortAvailability(profiles, bundle, variant, s, c);
            const usingBaseEntry = provenance.disabled
                ? false
                : (provenance.entry.source === "none" || availability.entry.status === "unavailable");
            const effective = {
                disabled: provenance.disabled,
                entryRef: provenance.entry.ref,
                entryLabel: provenance.entry.sel ? entryProfileLabel(provenance.entry.sel) : "Base universe",
                entrySource: provenance.entry.source,
                entryStatus: availability.entry.status,
                beRef: provenance.be.ref,
                beLabel: provenance.be.sel ? beProfileLabel(provenance.be.sel) : "None",
                beSource: provenance.be.source,
                beStatus: availability.be.status,
                targetRef: provenance.target.ref,
                targetLabel: provenance.target.sel ? targetProfileLabel(provenance.target.sel) : "Run default",
                targetSource: provenance.target.source,
                targetStatus: availability.target.status,
                usingBaseEntry,
            };
            cells[`${s}|${c}`] = { session: s, cell: c, provenance, availability, effective };
        }
    }
    return { pair: pairFromBundle(bundle), cells, order: { sessions: [...SESSION_KEYS], cells: [...CELL_KEYS] } };
}

/** Active = enabled AND at least one cohort resolves to a real change. */
export function isProfilesActive(profiles) {
    if (!profiles || profiles.enabled !== true) return false;
    for (const s of SESSION_KEYS) {
        for (const c of CELL_KEYS) {
            const cfg = resolveCohortConfig(profiles, s, c);
            if (cfg.disabled || cfg.entry || cfg.be || cfg.target) return true;
        }
    }
    return false;
}

/** Count of EXPLICIT per-cohort overrides (not global-default inheritance), for
 *  the override chip. Counts a cohort whose own override object sets anything,
 *  plus whole-session disables. Card-level defaults and the global default are
 *  inheritance, not per-cohort overrides, so they are not counted here. */
export function countOverrides(profiles) {
    let n = 0;
    for (const s of SESSION_KEYS) {
        const card = profiles?.cards?.[s];
        if (!card) continue;
        if (card.enabled === false) { n += CELL_KEYS.length; continue; }
        for (const c of CELL_KEYS) {
            const ov = card.overrides?.[c];
            if (ov && (ov.enabled === false || ov.enabled === true || ov.entryRef || ov.beRef || ov.targetRef)) n += 1;
        }
    }
    return n;
}

/**
 * Panel-local research control: the baseline (or configured control) entry
 * universe for the active bundle. Returns { trades, stats, available, entryKey }
 * so the cards panel can show a "Live vs Control" delta WITHOUT touching RunDetail.
 */
export function resolveControlSummary(bundle, profiles) {
    const ref = profiles?.control?.baselineProfileRef || BASELINE_ENTRY_ID;
    const sel = lookupEntry(profiles, ref) || { model: "baseline" };
    const key = buildEntryKey(sel);
    const trades = bundle ? entryUniverseTrades(bundle, key) : null;
    return {
        entryKey: key,
        label: entryProfileLabel(sel),
        available: Array.isArray(trades),
        trades: trades || [],
        stats: summarizeTradeSanity(trades || []),
    };
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
            if (cfg.disabled || cfg.entry || cfg.be || cfg.target) replace.set(`${s}|${c}`, cfg);
        }
    }

    const result = [];
    // Keep untouched cohorts as-is (covers ungoverned sessions + inherited cohorts).
    for (const [ck, list] of baseByCohort) {
        if (!replace.has(ck)) { for (const t of list) result.push(t); }
    }

    const warnings = [...(universe.warnings || [])];
    const attr = {
        active: true, removed: 0, swapped: 0, beApplied: 0, targetRescored: 0,
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

        // ── Target rescore (2B.1b) — Entry → BE → Target → Stats ─────────────────
        // Exact only: replace r with the trade's exit_r_by_target[token]. No replay.
        // Unavailable target (not in this pair's export) → keep baked r + flag.
        if (cfg.target) {
            const tok = numTok(cfg.target.value);
            if (targetAvailable(bundle, cfg.target)) {
                list = list.map((t) => {
                    const exitR = t.exit_r_by_target?.[tok];
                    if (exitR != null) {
                        attr.targetRescored += 1;
                        return { ...t, r: exitR, net_r: exitR, netR: exitR };
                    }
                    return t; // this trade lacks the target column → keep baked r
                });
            } else {
                attr.unavailable.push({ cohort: ck, kind: "target", token: tok, value: cfg.target.value });
                warnings.push({ code: "SESSION_CARD_TARGET_UNAVAILABLE", message: `Target ${cfg.target.value}R not in this pair's export for ${ck}; kept exported target.` });
            }
        }

        for (const t of list) result.push(t);
    }

    const changed = attr.removed || attr.swapped || attr.beApplied || attr.targetRescored || attr.unavailable.length;
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
