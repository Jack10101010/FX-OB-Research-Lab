// cohortKeys.js — neutral cohort + entry-key primitives (4-Layer Strategy Builder, P0).
//
// Pure, dependency-free building blocks shared by the session-scenario layer and the
// result/Management display (sessionResults.js) — extracted VERBATIM from
// sessionProfiles.js so they no longer require importing the global session-card
// overlay module. This file contains ONLY primitives:
//   • matrix axes (SESSIONS / CELLS and their key lists)
//   • trade → cohort canonicalisers (session / direction / structure / cell / cohortOf)
//   • entry-key building (thresholdToKeyPart / armToFillMode / buildEntryKey)
//
// HARD CONSTRAINTS (do not violate):
//   • No localStorage, no store state, no React, no overlay application, no mutation.
//   • Behaviour is byte-identical to the former sessionProfiles.js definitions
//     (cohortKeys.validate.mjs proves parity).
//
// sessionProfiles.js re-exports everything here for backward compatibility; existing
// imports keep working unchanged.

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

// ── Entry-key building (inlined; mirrors tradeUniverse) ───────────────────────

export function thresholdToKeyPart(n) {
    if (n == null || !isFinite(Number(n))) return null;
    const num = Number(n);
    const intPart = Math.floor(num);
    const fracPart = Math.round((num - intPart) * 100);
    if (fracPart === 0) return `${intPart}p0`;
    if (fracPart % 10 === 0) return `${intPart}p${fracPart / 10}`;
    return `${intPart}p${fracPart}`;
}

/** Arm token → exported fill-mode ("same"/"next"/"d2".."d6"). */
export function armToFillMode(arm) {
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
