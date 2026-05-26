// ── failuresUtils.js ─────────────────────────────────────────────────────────
// Pure filtering and field normalisation utilities for Failures Lab.
// No React. No side effects.
// sessionOf and parseDate are imported from entryFormatters — never duplicated.

export {
    sessionOf,
    parseDate,
    dayIndex,
    WEEKDAYS,
    SESSIONS,
    isFiniteNumber,
    num,
    round1,
    round2,
    fmtR,
    fmtPct,
    fmtMaybeR,
    fmtMaybePct,
} from "@/components/lab/entries/analytics/entryFormatters";

// ── Loser / Winner filters ────────────────────────────────────────────────────

export function filterLosers(trades) {
    if (!Array.isArray(trades)) return [];
    return trades.filter(t => {
        const outcome = String(t?.outcome ?? "").toLowerCase();
        const r = Number(t?.r);
        return outcome === "loss" || r < 0;
    });
}

export function filterWinners(trades) {
    if (!Array.isArray(trades)) return [];
    return trades.filter(t => {
        const outcome = String(t?.outcome ?? "").toLowerCase();
        const r = Number(t?.r);
        return outcome === "win" || r > 0;
    });
}

// ── Safe field accessors ──────────────────────────────────────────────────────

export function rOf(trade) {
    const v = Number(trade?.r ?? trade?.pnl_r ?? trade?.R);
    return Number.isFinite(v) ? v : 0;
}

export function directionOf(trade) {
    const v = String(trade?.direction ?? trade?.side ?? "").toLowerCase();
    if (v.includes("short") || v.includes("sell") || v.includes("bear")) return "short";
    if (v.includes("long")  || v.includes("buy")  || v.includes("bull")) return "long";
    return "unknown";
}

export function structureOf(trade) {
    const v = String(trade?.structure ?? trade?.structureTag ?? trade?.structure_tag ?? "").toLowerCase();
    if (v.includes("choch") || v.includes("change")) return "choch";
    if (v.includes("bos")   || v.includes("break"))  return "bos";
    return "unknown";
}

export function obWidthOf(trade) {
    const v = Number(trade?.ob_width ?? trade?.obWidth ?? trade?.ob_width_pips);
    return Number.isFinite(v) && v > 0 ? v : null;
}

// Returns duration in minutes using entry + exit timestamps.
// Returns null if either timestamp is missing/invalid.
export function durationMinutes(trade) {
    const entry = _parseTs(trade?.entry ?? trade?.entryTime ?? trade?.fill_time);
    const exit  = _parseTs(trade?.exit  ?? trade?.exitTime  ?? trade?.close_time);
    if (!entry || !exit) return null;
    const mins = (exit - entry) / 60000;
    return mins >= 0 ? mins : null;
}

function _parseTs(value) {
    if (!value) return null;
    if (typeof value === "number" && Number.isFinite(value)) {
        // epoch seconds vs ms heuristic
        return value > 1e10 ? new Date(value) : new Date(value * 1000);
    }
    const d = new Date(String(value).trim().replace(/^(\d{4}-\d{2}-\d{2})\s/, "$1T"));
    return Number.isFinite(d.getTime()) ? d : null;
}

// ── Derived temporal fields ───────────────────────────────────────────────────

export function entryHour(trade) {
    const ts = _parseTs(trade?.entry ?? trade?.entryTime ?? trade?.fill_time);
    return ts ? ts.getUTCHours() : null;
}

export function entryWeekday(trade) {
    // Returns 0 = Mon … 4 = Fri (5 = Sat, 6 = Sun — rare in FX)
    const ts = _parseTs(trade?.entry ?? trade?.entryTime ?? trade?.fill_time);
    if (!ts) return null;
    return (ts.getUTCDay() + 6) % 7; // JS: 0=Sun → map to Mon=0
}

export function entryMonth(trade) {
    const ts = _parseTs(trade?.entry ?? trade?.entryTime ?? trade?.fill_time);
    return ts ? ts.getUTCMonth() : null; // 0 = Jan
}

export function entryYear(trade) {
    const ts = _parseTs(trade?.entry ?? trade?.entryTime ?? trade?.fill_time);
    return ts ? ts.getUTCFullYear() : null;
}

export function entryQuarter(trade) {
    const m = entryMonth(trade);
    return m != null ? Math.floor(m / 3) + 1 : null; // 1–4
}

// ── Boolean breach helpers ────────────────────────────────────────────────────

export function isFullBreach(trade) {
    if (trade?.ob_fully_breached === true) return true;
    const pct = Number(trade?.max_ob_penetration_pct);
    return Number.isFinite(pct) && pct >= 100;
}

export function isCloseBreach(trade) {
    return trade?.close_confirmed_ob_breach === true;
}

// ── Cost ratio ────────────────────────────────────────────────────────────────

export function costRatio(trade, runConfig) {
    const w = obWidthOf(trade);
    if (!w || w <= 0) return null;
    const spread = Number(runConfig?.spread ?? runConfig?.spread_pips ?? 0);
    const slip   = Number(runConfig?.slippage ?? 0);
    const comm   = Number(runConfig?.commission ?? 0);
    const cost   = spread + slip + comm;
    return cost / w;
}

// ── Tier-0 field check ────────────────────────────────────────────────────────
// Returns true if a given field is likely present on this trade set
// (based on the first 20 trades to avoid full-scan cost).

export function fieldPresent(trades, fieldName, sampleSize = 20) {
    if (!Array.isArray(trades) || trades.length === 0) return false;
    const sample = trades.slice(0, sampleSize);
    const found  = sample.filter(t => t?.[fieldName] != null && t[fieldName] !== "").length;
    return found / sample.length >= 0.5;
}
