// ── marketStateSource.js ────────────────────────────────────────────────────
// Phase 3d — Engine-preferred Market State adapter.
//
// The Lux-OB-Backtester engine (Phase 3c, label mode) emits canonical per-trade
// Market State columns (regime_spec.md §9, source="engine"). This adapter lets the UI
// PREFER those authoritative engine values and fall back to the client reconstruction
// (data/marketState.js, source="client") only for legacy runs that don't carry them.
//
// Design goals:
//   - Detect engine columns on an imported trade row.
//   - When present, use them directly and DO NOT reconstruct client-side.
//   - When absent, fall back to the client panel lookup, preserving legacy behaviour.
//   - Produce ONE snapshot shape (the marketState.js panel shape) so the UI renders
//     identically regardless of source.
//
// Pure module (no React). Imports only the pure client engine for the fallback path.

import { stateForTrade as _clientStateForTrade } from "./marketState.js";

// Canonical engine-emitted trade columns (snake_case, regime_spec.md §9). A trade is
// "engine-instrumented" iff it carries a non-empty `market_state`.
export const ENGINE_MARKET_STATE_COLUMNS = Object.freeze([
    "market_state", "trend_state", "volatility_state", "chop_state",
    "ema_value", "ema_relation", "px_vs_ema", "bbw_value", "bbw_threshold",
    "adx_value", "state_confirmed", "state_known_at", "shifted_days",
    "source", "version",
]);

function get(row, ...keys) {
    if (!row) return null;
    for (const k of keys) {
        const v = row[k];
        if (v !== undefined && v !== null && v !== "") return v;
    }
    return null;
}
const num = (v) => (v === null || v === undefined || v === "" || Number.isNaN(Number(v)) ? null : Number(v));
const str = (v) => (v === null || v === undefined || v === "" ? null : String(v));
const bool = (v) => {
    if (v === null || v === undefined || v === "") return null;
    if (typeof v === "boolean") return v;
    const s = String(v).trim().toLowerCase();
    if (["true", "1", "yes"].includes(s)) return true;
    if (["false", "0", "no"].includes(s)) return false;
    return null;
};

/**
 * Build the engine Market State snapshot from a raw imported trade/CSV row, or null
 * when the row carries no engine `market_state` (⇒ caller should reconstruct client-side).
 * Returns the SAME camelCase shape as the marketState.js panel row so the UI is
 * source-agnostic. Always tagged `source:"engine"`.
 */
export function engineSnapshotFromRow(row) {
    const ms = get(row, "market_state", "marketState");
    if (ms === null || String(ms).trim() === "") return null;
    const px = num(get(row, "px_vs_ema", "pxVsEma"));
    return {
        marketState: String(ms),
        trendState: str(get(row, "trend_state", "trendState")),
        volatilityState: str(get(row, "volatility_state", "volatilityState")),
        chopState: str(get(row, "chop_state", "chopState")),
        ema: num(get(row, "ema_value", "emaValue")),
        emaRelation: str(get(row, "ema_relation", "emaRelation")),
        pxVsEma: px,
        bbw: num(get(row, "bbw_value", "bbwValue")),
        bbwThreshold: num(get(row, "bbw_threshold", "bbwThreshold")),
        adx: num(get(row, "adx_value", "adxValue")),
        confirmed: bool(get(row, "state_confirmed", "stateConfirmed")) ?? false,
        knownAt: str(get(row, "state_known_at", "stateKnownAt")),
        shiftedDays: num(get(row, "shifted_days", "shiftedDays")),
        source: "engine",
        version: str(get(row, "version")),
    };
}

/** True when the trade carries an engine-emitted Market State snapshot. */
export function tradeHasEngineMarketState(trade) {
    return !!(trade && trade.regimeEmit && trade.regimeEmit.marketState);
}

/**
 * Resolve a trade's Market State snapshot, PREFERRING the engine emission.
 *
 * - Engine present (`trade.regimeEmit`): returns it and NEVER calls the client
 *   reconstruction — `stateForTrade` is not invoked.
 * - Engine absent: falls back to the client panel lookup (source:"client").
 *
 * `stateForTradeFn` is injectable for testing; production omits it and uses the
 * canonical client engine.
 */
export function resolveTradeMarketState(trade, panel, stateForTradeFn = _clientStateForTrade) {
    if (tradeHasEngineMarketState(trade)) return trade.regimeEmit;
    if (!panel || typeof stateForTradeFn !== "function") return null;
    return stateForTradeFn(trade, panel);
}

/** Friendly Source label for the UI. */
export function formatMarketStateSource(source) {
    if (source === "engine") return "Engine";
    if (source === "client") return "Client Reconstruction";
    return source ?? "—";
}

// ── Phase 5 — OB-adjacent sanity-card helpers (pure) ─────────────────────────
// Verdict + compact card model for the Strategy Map Market State sanity cards.
// No indicator math — consumes the snapshot (engine trade.regimeEmit, else client
// panel lookup) + the run's allowed-states + the trade's backend outcome.

export const REGIME_VERDICT = Object.freeze({
    ALLOWED: "Allowed",
    BLOCKED: "Blocked",
    UNKNOWN: "Unknown / Allowed",
    MISMATCH: "Direction mismatch",
});

function _obIsBullish(obSide) {
    return String(obSide || "").toLowerCase().startsWith("bull");
}

/**
 * Decide the sanity verdict for an OB's trade.
 * Precedence (per Phase 5 spec):
 *   1. backend REGIME_BLOCKED wins → Blocked (authoritative).
 *   2. no snapshot / unknown / unconfirmed → Unknown / Allowed.
 *   3. marketState ∈ allowedStates → Allowed (but if the side conflicts with the
 *      trend, downgrade to a Direction-mismatch WARNING — not a hard block).
 *   4. marketState ∉ allowedStates → Blocked (would block in filter mode).
 * @returns {{ verdict, tone, reason }} tone ∈ neutral|success|danger|warning
 */
export function marketStateVerdict({ snapshot, allowedStates, obSide, tradeOutcome } = {}) {
    if (tradeOutcome === "REGIME_BLOCKED") {
        return { verdict: REGIME_VERDICT.BLOCKED, tone: "danger", reason: "backend blocked this fill (regime_blocked)" };
    }
    if (!snapshot || !snapshot.marketState || snapshot.confirmed === false) {
        return { verdict: REGIME_VERDICT.UNKNOWN, tone: "neutral", reason: "no confirmed market state — not gated" };
    }
    const allowed = Array.isArray(allowedStates) ? allowedStates : null;
    const ms = snapshot.marketState;
    if (allowed && allowed.length && !allowed.includes(ms)) {
        return { verdict: REGIME_VERDICT.BLOCKED, tone: "danger", reason: `state ${ms} not in allowed states` };
    }
    // allowed (or no allowed-set constraint) → check side vs trend for a soft warning
    const trend = snapshot.trendState;
    if (obSide != null && trend) {
        const bullOb = _obIsBullish(obSide);
        const conflict = (bullOb && trend === "Bear") || (!bullOb && trend === "Bull");
        if (conflict) {
            return {
                verdict: REGIME_VERDICT.MISMATCH, tone: "warning",
                reason: `${bullOb ? "bullish" : "bearish"} OB while trend is ${trend}`,
            };
        }
    }
    return { verdict: REGIME_VERDICT.ALLOWED, tone: "success", reason: "state in allowed set" };
}

/**
 * Build the compact card model for one OB's trade. Presentation-only formatting;
 * `snapshot` is engine-preferred (trade.regimeEmit) or the client fallback resolved
 * by the caller. Returns null when there is no trade snapshot AND the trade wasn't
 * regime-blocked (nothing meaningful to show).
 */
export function obCardModel({ ob, trade, snapshot, allowedStates } = {}) {
    const outcome = trade?.outcome ?? null;
    if (!snapshot && outcome !== "REGIME_BLOCKED") return null;
    const obSide = ob?.side ?? ob?.direction ?? trade?.direction ?? null;
    const bullish = _obIsBullish(obSide);
    const v = marketStateVerdict({ snapshot, allowedStates, obSide, tradeOutcome: outcome });
    const px = snapshot?.pxVsEma;
    return {
        obId: ob?.id ?? ob?.obId ?? ob?.ob_id ?? trade?.obId ?? null,
        side: bullish ? "bullish" : "bearish",
        placement: bullish ? "below" : "above",     // bearish above, bullish below
        marketState: snapshot?.marketState ?? null,
        verdict: v.verdict,
        tone: v.tone,
        reason: v.reason,
        rows: {
            session: trade?.session ?? null,
            obSide: bullish ? "Bullish OB" : "Bearish OB",
            source: formatMarketStateSource(snapshot?.source),
            version: snapshot?.version ?? null,
            knownAt: snapshot?.knownAt ?? null,
            emaRelation: snapshot?.emaRelation ?? (px == null ? null : px > 0 ? "above" : "below"),
            pxVsEma: px ?? null,
            volatilityState: snapshot?.volatilityState ?? null,
            bbw: snapshot?.bbw ?? null,
            bbwThreshold: snapshot?.bbwThreshold ?? null,
            adx: snapshot?.adx ?? null,
            chopState: snapshot?.chopState ?? null,
            confirmed: snapshot?.confirmed ?? null,
        },
        blocked: outcome === "REGIME_BLOCKED"
            ? {
                outcome,
                cancelReason: trade?.cancel_reason ?? trade?.cancelReason ?? null,
                missedReason: trade?.missed_reason ?? trade?.missedReason ?? null,
            }
            : null,
    };
}
