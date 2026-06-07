/**
 * fillStateBreakdown.js
 *
 * Pure aggregation for the Classification Tab V2 (CLASSIFICATION-TAB-V2-PLAN).
 * No React, no side effects.
 *
 * Builds three views over a trade set, all keyed by the canonical fill-state
 * vocabulary (see tradeClassificationDims.deriveFillState):
 *   occupied_at_arm | vacant_at_arm (parent) | aae | vacant_no_aae | unknown_at_arm
 *
 * Metrics (identical everywhere, matching buildClassificationBreakdown):
 *   Trades = count
 *   WR     = wins / (wins + losses)   — breakevens EXCLUDED from the denominator
 *   Net R  = Σ r
 *   Avg R  = Σ r / count              — breakevens INCLUDED in the denominator
 *
 * Win/loss/performance classification is delegated to tradeClassification.js so
 * these numbers reconcile with the KPI strip, ledger, and the existing
 * Entry-Model breakdown. Relative imports keep the module node-testable.
 */

import { buildTradeClassification } from "./tradeClassificationDims.js";
import { isPerformanceTrade, isWinTrade, isLossTrade } from "./tradeClassification.js";

// ─────────────────────────────────────────────────────────────────────────────
// Accumulators
// ─────────────────────────────────────────────────────────────────────────────

function emptyAcc() {
    return { count: 0, wins: 0, losses: 0, sumR: 0 };
}

function addTrade(acc, trade) {
    const r = Number.isFinite(Number(trade?.r)) ? Number(trade.r) : 0;
    acc.count += 1;
    if (isWinTrade(trade))  acc.wins += 1;
    if (isLossTrade(trade)) acc.losses += 1;
    acc.sumR += r;
}

/** Merge `from` into `into` — used to roll children into a parent WITHOUT
 *  re-iterating trades (prevents double counting). */
function addAcc(into, from) {
    into.count  += from.count;
    into.wins   += from.wins;
    into.losses += from.losses;
    into.sumR   += from.sumR;
}

function toStats(acc) {
    const wl = acc.wins + acc.losses;
    return {
        count:   acc.count,
        wins:    acc.wins,
        losses:  acc.losses,
        winRate: wl > 0 ? acc.wins / wl : null,
        netR:    acc.sumR,
        avgR:    acc.count > 0 ? acc.sumR / acc.count : 0,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// Fill-state breakdown
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Aggregate performance trades by canonical fill state. The parent
 * `vacant_at_arm` row is derived by SUMMING its two children (aae +
 * vacant_no_aae) — never by bucketing a trade into both parent and child.
 *
 * @param {object[]} trades
 * @returns {{
 *   occupied_at_arm: object, vacant_at_arm: object, aae: object,
 *   vacant_no_aae: object, unknown_at_arm: object, hasInstrumentation: boolean
 * }}
 */
export function buildFillStateBreakdown(trades) {
    const leaves = {
        occupied_at_arm: emptyAcc(),
        aae:             emptyAcc(),
        vacant_no_aae:   emptyAcc(),
        unknown_at_arm:  emptyAcc(),
    };

    for (const trade of Array.isArray(trades) ? trades : []) {
        if (!isPerformanceTrade(trade)) continue;
        let cls;
        try { cls = buildTradeClassification(trade); }
        catch { continue; }
        const state = cls.fill_state;
        const bucket = leaves[state] || (leaves[state] = emptyAcc());
        addTrade(bucket, trade);
    }

    // Parent = sum of children (no re-bucketing).
    const vacant = emptyAcc();
    addAcc(vacant, leaves.aae);
    addAcc(vacant, leaves.vacant_no_aae);

    const occupied   = toStats(leaves.occupied_at_arm);
    const vacantStat = toStats(vacant);

    // Instrumented = we actually know occupancy for at least one trade.
    const hasInstrumentation = occupied.count > 0 || vacantStat.count > 0;

    return {
        occupied_at_arm: occupied,
        vacant_at_arm:   vacantStat,
        aae:             toStats(leaves.aae),
        vacant_no_aae:   toStats(leaves.vacant_no_aae),
        unknown_at_arm:  toStats(leaves.unknown_at_arm),
        hasInstrumentation,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// Session breakdown
// ─────────────────────────────────────────────────────────────────────────────

// Canonical display ordering for known sessions; anything else sorts after,
// "Unknown" last.
const SESSION_ORDER = ["New York", "London", "London Lull", "Asia", "Outside"];

// Raw label (lower-cased) → canonical display label.
const SESSION_CANON = {
    "new york":     "New York",
    "ny":           "New York",
    "new_york":     "New York",
    "london":       "London",
    "london lull":  "London Lull",
    "london_lull":  "London Lull",
    "lull":         "London Lull",
    "asia":         "Asia",
    "outside":      "Outside",
};

// Canonical display label → researchGlossary key (for tooltips).
const SESSION_GLOSSARY_KEY = {
    "New York":     "session_new_york",
    "London":       "session_london",
    "London Lull":  "session_london_lull",
    "Asia":         "session_asia",
    "Outside":      "session_outside",
};

function canonSession(trade) {
    const raw = trade?.fillSession
        || trade?.fill_session
        || trade?.session
        || trade?.trade_session
        || trade?.entry_session;
    const s = String(raw ?? "").trim();
    if (!s || s === "—") return "Unknown";
    return SESSION_CANON[s.toLowerCase()] ?? s;
}

/**
 * Aggregate performance trades by fill session. Mutually exclusive (one session
 * per trade), so no double counting. Rows are ordered by SESSION_ORDER, then any
 * unrecognized sessions, then "Unknown" last.
 *
 * @param {object[]} trades
 * @returns {Array<{ session: string, glossaryKey: string|null,
 *   count: number, wins: number, losses: number, winRate: number|null,
 *   netR: number, avgR: number }>}
 */
export function buildSessionBreakdown(trades) {
    const map = new Map();
    for (const trade of Array.isArray(trades) ? trades : []) {
        if (!isPerformanceTrade(trade)) continue;
        const label = canonSession(trade);
        if (!map.has(label)) map.set(label, emptyAcc());
        addTrade(map.get(label), trade);
    }

    const mkRow = (label) => ({
        session:     label,
        glossaryKey: SESSION_GLOSSARY_KEY[label] ?? null,
        ...toStats(map.get(label)),
    });

    const rows = [];
    const seen = new Set();
    for (const label of SESSION_ORDER) {
        if (map.has(label)) { rows.push(mkRow(label)); seen.add(label); }
    }
    for (const label of map.keys()) {
        if (label === "Unknown" || seen.has(label)) continue;
        rows.push(mkRow(label)); seen.add(label);
    }
    if (map.has("Unknown")) rows.push(mkRow("Unknown"));
    return rows;
}

// ─────────────────────────────────────────────────────────────────────────────
// Signal cards
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Derive the headline Signal Card payloads from the two breakdowns above.
 * Cards read the SAME aggregation objects — no independent recompute.
 *
 * Always: OB Vacant At Arm (primary), AAE, Occupied At Arm (baseline).
 * Conditional: Outside Session — only when the session breakdown actually
 * contains an "Outside" bucket with trades (the data may not emit it).
 *
 * Each card: { id, tagKey?, label?, tooltipKey, stats, tone }.
 *   - tagKey present  → consumer resolves the display label via getTagMeta.
 *   - label present   → consumer uses the literal label (sessions aren't in the
 *                        classification registry).
 *
 * @param {object} fillStateBreakdown
 * @param {object[]} sessionBreakdown
 * @returns {object[]}
 */
export function buildSignalCards(fillStateBreakdown, sessionBreakdown) {
    const fb = fillStateBreakdown || {};
    const cards = [
        { id: "vacant_at_arm",   tagKey: "vacant_at_arm",   tooltipKey: "vacant_at_arm",   stats: fb.vacant_at_arm   || toStats(emptyAcc()), tone: "success" },
        { id: "aae",             tagKey: "aae",             tooltipKey: "aae",             stats: fb.aae             || toStats(emptyAcc()), tone: "warning" },
        { id: "occupied_at_arm", tagKey: "occupied_at_arm", tooltipKey: "occupied_at_arm", stats: fb.occupied_at_arm || toStats(emptyAcc()), tone: "muted" },
    ];

    const outside = (Array.isArray(sessionBreakdown) ? sessionBreakdown : [])
        .find((row) => row.session === "Outside");
    if (outside && outside.count > 0) {
        cards.push({
            id: "session_outside",
            label: "Outside Session",
            tooltipKey: "session_outside",
            stats: outside,
            tone: outside.avgR < 0 ? "danger" : "muted",
        });
    }

    return cards;
}
