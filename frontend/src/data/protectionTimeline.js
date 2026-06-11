// protectionTimeline.js — pure event-timeline builder for protection verification.
//
// BE-STRATEGY-MAP-VISUAL-VERIFICATION P1. No React, no imports — self-contained
// so the validation harness can run it directly.
//
// Designed as a GENERIC protection-event model so future protection systems
// (partial risk reduction, dynamic stop tightening, multi-stage) reuse it: they
// add event types and emit additional `stop_moved` rows; the overlay + panel
// iterate events generically. Break-even is the first `kind`.
//
// Integrity rules (mirror the resolver):
//   • All chart placement uses TIMESTAMPS, never absolute candle indices.
//   • loss_saved / winner_cut are only claimed when a baselineTrade is paired;
//     otherwise the trade is classified as the neutral `be_exit`.

// ── helpers ──────────────────────────────────────────────────────────────────

function num(v) {
    if (v == null || v === "") return null;
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : null;
}
function rnd(v, n = 2) { const f = 10 ** n; return Math.round(Number(v) * f) / f; }
function bool(v) {
    if (v === true) return true;
    if (v === false || v == null || v === "") return false;
    return ["true", "1", "yes", "y"].includes(String(v).trim().toLowerCase());
}
function isLong(direction) {
    const d = String(direction || "").toLowerCase();
    return d.startsWith("long") || d.startsWith("bull") || d === "buy";
}
/** Realized R for a trade row (net_r / r / pnl_r). */
function tradeR(t) {
    return num(t?.net_r) ?? num(t?.netR) ?? num(t?.r) ?? num(t?.pnl_r) ?? null;
}
function field(t, ...names) {
    for (const n of names) {
        if (t && t[n] != null && t[n] !== "") return t[n];
    }
    return null;
}

// ── baseline pairing ───────────────────────────────────────────────────────

/**
 * Pair a BE trade to its no-BE baseline trade. Prefers a stable id
 * (base_trade_id → trade_id → id), then falls back to fill-time + entry price.
 * Returns the matched baseline trade or null.
 */
export function pairBaselineTrade(beTrade, baselineTrades) {
    if (!beTrade || !Array.isArray(baselineTrades) || !baselineTrades.length) return null;
    const idOf = (t) => String(
        field(t, "base_trade_id", "baseTradeId") ?? field(t, "trade_id", "rawTradeId") ?? field(t, "id") ?? "",
    ).trim();
    const beId = idOf(beTrade);
    if (beId) {
        const byId = baselineTrades.find((t) => idOf(t) === beId);
        if (byId) return byId;
    }
    // Fallback: same fill time + (approx) entry price.
    const beFill = String(field(beTrade, "fill_time", "entry") ?? "").trim();
    const beEntry = num(beTrade.entryPrice);
    if (beFill) {
        const byFill = baselineTrades.find((t) => {
            const f = String(field(t, "fill_time", "entry") ?? "").trim();
            if (f !== beFill) return false;
            const e = num(t.entryPrice);
            return beEntry == null || e == null || Math.abs(e - beEntry) < 1e-9;
        });
        if (byFill) return byFill;
    }
    return null;
}

// ── timeline builder ─────────────────────────────────────────────────────────

export const BE_CLASSIFICATIONS = Object.freeze({
    LOSS_SAVED: "loss_saved",
    WINNER_CUT: "winner_cut",
    BE_EXIT: "be_exit",
    ARMED_NOT_TRIGGERED: "armed_not_triggered",
    NEVER_ARMED: "never_armed",
    UNKNOWN: "unknown",
});

const CLASSIFICATION_LABELS = {
    loss_saved: "Loss Saved",
    winner_cut: "Winner Cut",
    be_exit: "BE Exit",
    armed_not_triggered: "Armed, Not Triggered",
    never_armed: "Never Armed",
    unknown: "Unknown",
};

export function classificationLabel(c) {
    return CLASSIFICATION_LABELS[c] || "Unknown";
}

/**
 * Build a break-even verification timeline for one BE scenario trade.
 *
 * @param {object}   args.beTrade        BE scenario trade row (carries be_* fields).
 * @param {object?}  args.baselineTrade  Matching no-BE trade for delta + saved/cut.
 * @param {object?}  args.scenario       { armLevelR, triggerBasis, beScenarioKey, delayCandles, stopBufferR }.
 * @returns {{ classification, events, geometry, originalR, beR, deltaR, warnings }}
 */
export function buildBreakEvenTimeline({ beTrade, baselineTrade = null, scenario = {} } = {}) {
    const warnings = [];
    if (!beTrade) {
        return { classification: "unknown", events: [], geometry: {}, originalR: null, beR: null, deltaR: null, warnings: ["no_be_trade"] };
    }

    const entryPrice = num(beTrade.entryPrice);
    const originalStop = num(beTrade.stop);
    const originalTp = num(beTrade.tp) || null;
    const long = isLong(beTrade.direction);
    const risk = entryPrice != null && originalStop != null ? Math.abs(entryPrice - originalStop) : null;

    const armed = bool(field(beTrade, "be_armed", "beArmed"));
    const triggered = bool(field(beTrade, "be_triggered", "beTriggered"));
    const reason = String(field(beTrade, "be_exit_reason", "beExitReason") || "").toLowerCase();
    const armLevelR = num(field(beTrade, "be_arm_level_r", "beArmLevelR")) ?? num(scenario.armLevelR);
    const stopBufferR = num(scenario.stopBufferR) ?? 0;
    const delayCandles = num(scenario.delayCandles) ?? 0;

    const beArmTime = String(field(beTrade, "be_arm_time", "beArmTime") || "") || null;
    const beExitTime = String(field(beTrade, "be_exit_time", "beExitTime") || "") || null;
    const fillTime = String(field(beTrade, "fill_time", "entry") || "") || null;
    const finalExitTime = String(field(beTrade, "exit_time", "exit") || "") || null;

    // BE arm price (entry ± armR × risk) and BE stop price (where the stop moved to).
    const beArmPrice = (risk != null && armLevelR != null)
        ? (long ? entryPrice + armLevelR * risk : entryPrice - armLevelR * risk)
        : null;
    const beStopPrice = num(field(beTrade, "be_exit_price", "beExitPrice")) ?? entryPrice;

    const beExitR = num(field(beTrade, "be_exit_r", "beExitR"));
    const beR = tradeR(beTrade);
    const originalR = baselineTrade ? tradeR(baselineTrade) : null;
    const deltaR = (beR != null && originalR != null) ? rnd(beR - originalR) : null;

    // ── classification ───────────────────────────────────────────────────────
    let classification;
    if (reason === "never_armed" || (!armed && !triggered && reason !== "be_stop")) {
        classification = "never_armed";
    } else if (reason === "armed_not_triggered" || (armed && !triggered)) {
        classification = "armed_not_triggered";
    } else if (reason === "be_stop" || triggered) {
        if (baselineTrade && originalR != null) {
            if (originalR < 0) classification = "loss_saved";
            else if (originalR > 0) classification = "winner_cut";
            else classification = "be_exit";
        } else {
            classification = "be_exit"; // neutral — cannot claim saved/cut without baseline
            warnings.push("no_baseline_pairing");
        }
    } else {
        classification = "unknown";
        warnings.push("unrecognized_be_state");
    }

    if (beArmTime == null && (armed || triggered)) warnings.push("missing_be_arm_time");
    if (triggered && beExitTime == null) warnings.push("missing_be_exit_time");

    // ── events (ordered; placement keyed on timestamps only) ───────────────────
    const events = [];
    events.push({ type: "entry", label: "Entry", time: fillTime, price: entryPrice, r: 0, derived: false, note: "" });

    if (armed || triggered) {
        events.push({
            type: "be_armed", label: "BE Armed", time: beArmTime, price: beArmPrice,
            r: armLevelR, derived: beArmPrice == null,
            note: armLevelR != null ? `arm ${armLevelR}R` : "",
        });
        events.push({
            type: "stop_moved", label: "Stop Moved", time: beArmTime, price: beStopPrice,
            r: stopBufferR, derived: true,
            note: delayCandles ? `+${delayCandles} candle delay` : "to break-even (0R)",
        });
    }

    if (triggered) {
        events.push({
            type: "be_exit", label: "BE Exit", time: beExitTime, price: beStopPrice,
            r: beExitR != null ? beExitR : beR, derived: false,
            note: "stop hit after arm",
        });
    } else {
        events.push({
            type: "final_exit", label: "Final Exit", time: finalExitTime, price: null,
            r: beR, derived: false,
            note: reason === "never_armed" ? "original exit (BE never armed)" : "original exit (BE armed, survived)",
        });
    }

    const geometry = {
        entryPrice, originalStop, originalTp,
        beArmPrice, beStopPrice, beArmTime, beExitTime,
        direction: long ? "long" : "short",
        armLevelR, triggerBasis: scenario.triggerBasis || String(field(beTrade, "be_trigger_basis", "beTriggerBasis") || "") || null,
        beScenarioKey: scenario.beScenarioKey || String(field(beTrade, "be_scenario_key", "beScenarioKey") || "") || null,
    };

    return { classification, events, geometry, originalR, beR, deltaR, warnings };
}

// ── affected-trade list (Protection Lab → Break-even) ────────────────────────

/**
 * Build the list of trades AFFECTED by a BE scenario — i.e. trades where the BE
 * stop fired (be_triggered / be_exit_reason="be_stop"). Each row is classified
 * loss_saved / winner_cut / be_exit (neutral when no baseline pairing), carries
 * compact identifiers + R values + BE timings, and the list is sorted by
 * descending |deltaR| (unpaired rows, deltaR=null, sort last).
 *
 * Trades that were never armed or armed-but-not-triggered are NOT "affected"
 * (BE did not change their exit) and are excluded.
 *
 * @returns {Array<object>} rows
 */
export function buildBeAffectedTrades({ beTrades, baselineTrades = [], scenario = {} } = {}) {
    const list = Array.isArray(beTrades) ? beTrades : [];
    const base = Array.isArray(baselineTrades) ? baselineTrades : [];
    const rows = [];
    for (const be of list) {
        const reason = String(field(be, "be_exit_reason", "beExitReason") || "").toLowerCase();
        const triggered = bool(field(be, "be_triggered", "beTriggered")) || reason === "be_stop";
        if (!triggered) continue; // only BE-affected trades
        const baselineTrade = pairBaselineTrade(be, base);
        const tl = buildBreakEvenTimeline({ beTrade: be, baselineTrade, scenario });
        rows.push({
            id: String(field(be, "id") ?? ""),
            baseTradeId: String(field(baselineTrade || {}, "id") ?? field(be, "id") ?? ""),
            obId: field(be, "displayObId") || field(be, "obId") || "",
            direction: field(be, "direction") || "",
            structure: field(be, "structure") || "",
            session: field(be, "session", "fillSession") || "",
            entryTime: String(field(be, "fill_time", "entry") || ""),
            originalR: tl.originalR,
            beR: tl.beR,
            deltaR: tl.deltaR,
            classification: tl.classification,
            armLevelR: scenario.armLevelR ?? null,
            triggerBasis: scenario.triggerBasis ?? null,
            beArmTime: String(field(be, "be_arm_time", "beArmTime") || ""),
            beExitTime: String(field(be, "be_exit_time", "beExitTime") || ""),
        });
    }
    const absDelta = (r) => (r.deltaR == null ? -1 : Math.abs(r.deltaR));
    rows.sort((a, b) => absDelta(b) - absDelta(a));
    return rows;
}
