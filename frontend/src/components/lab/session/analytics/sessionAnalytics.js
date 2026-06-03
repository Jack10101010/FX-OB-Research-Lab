/**
 * sessionAnalytics.js — Pure analytics for Session Lab.
 *
 * No React. No side effects. Safe inside useMemo.
 *
 * All session field resolution follows the strict priority order:
 *   1. trade.fillSession   (primary — backend-tagged)
 *   2. trade.fill_session  (snake_case alias)
 *   3. trade.session       (legacy)
 *   4. resolveSessionFromTimestamp(trade.entry) (UTC fallback — misses nothing
 *      when backend-tagged because the UTC cutoffs in sessionConfig are complete)
 *   5. "Unknown"
 */

import {
    SESSION_KEYS,
    resolveSessionFromTimestamp,
} from "../config/sessionConfig";

// ── Session field resolution ──────────────────────────────────────────────────

/**
 * Resolves the session key for a trade.
 * Uses backend-tagged fields first; only falls back to timestamp derivation
 * when none of the tagged fields are populated.
 *
 * @param {object} trade
 * @returns {string} session key from SESSION_KEYS, or "Unknown"
 */
export function resolveSession(trade) {
    const tagged =
        (typeof trade.fillSession === "string" && trade.fillSession.trim()) ||
        (typeof trade.fill_session === "string" && trade.fill_session.trim()) ||
        (typeof trade.session === "string" && trade.session.trim());
    if (tagged) return tagged;
    const fromTimestamp = resolveSessionFromTimestamp(trade.entry);
    return fromTimestamp || "Unknown";
}

// ── Field normalization helpers ───────────────────────────────────────────────

/** Returns the R value for a trade. */
export function getR(trade) {
    const v = trade.r ?? trade.netR ?? trade.pnl_r ?? trade.pnlR ?? 0;
    return Number(v) || 0;
}

/** Returns true if the trade is a Win. */
export function isWin(trade) {
    const o = String(trade.outcome || trade.result || "").toLowerCase();
    return o === "win" || o === "winner" || o === "1" || o === "true";
}

/** Returns true if the trade is a Loss. */
export function isLoss(trade) {
    const o = String(trade.outcome || trade.result || "").toLowerCase();
    return o === "loss" || o === "loser" || o === "-1" || o === "false";
}

/** Returns "Long" | "Short" | "Unknown". */
export function normalizeDirection(trade) {
    const d = String(trade.direction || "").toLowerCase();
    if (d === "long" || d === "buy" || d === "bull") return "Long";
    if (d === "short" || d === "sell" || d === "bear") return "Short";
    return "Unknown";
}

/** Returns "BOS" | "CHoCH" | "Unknown". */
export function normalizeStructure(trade) {
    const s = String(trade.structure || trade.structure_type || "").toUpperCase();
    if (s === "BOS") return "BOS";
    if (s === "CHOCH" || s === "CHoCH") return "CHoCH";
    return "Unknown";
}

// ── Session breakdown registry ────────────────────────────────────────────────

/**
 * SESSION_BREAKDOWN_DEFS — extensible registry of breakdown dimensions.
 *
 * Each entry: { key, title, getLabel(trade) → string, order? string[] }
 *
 * To add a new breakdown in future phases, append a new entry here.
 * Components loop over this array — nothing hardcoded in JSX.
 */
export const SESSION_BREAKDOWN_DEFS = [
    // ── Phase 1 — Required ──────────────────────────────────────────────────
    {
        key: "direction",
        title: "Long vs Short",
        getLabel: (t) => normalizeDirection(t),
        order: ["Long", "Short", "Unknown"],
    },
    {
        key: "structure",
        title: "Structure: BOS vs CHoCH",
        getLabel: (t) => normalizeStructure(t),
        order: ["BOS", "CHoCH", "Unknown"],
    },
    {
        key: "entryModel",
        title: "Entry Model",
        getLabel: (t) => {
            const raw = t.entry_model_key || t.entry_model || t.entryFamily || "";
            const s = String(raw).toLowerCase().trim();
            if (s === "baseline" || s === "") return "Baseline";
            if (s === "penetration") return "Penetration";
            if (s === "triggered_edge" || s === "triggeredge") return "Triggered Edge";
            // Return the raw value title-cased as a fallback
            return raw
                .replace(/_/g, " ")
                .replace(/\b\w/g, (c) => c.toUpperCase());
        },
    },
    {
        key: "triggerDelay",
        title: "Trigger Delay",
        getLabel: (t) => {
            const d = t.fill_delay_candles ?? t.fillDelayCandles ?? t.trigger_delay;
            if (d == null || d === "") return "Unknown";
            const n = Number(d);
            if (!Number.isFinite(n)) return "Unknown";
            if (n === 0) return "Same candle";
            if (n === 1) return "Next candle";
            if (n === 2) return "Delay +2";
            if (n === 3) return "Delay +3";
            return "Delay 4+";
        },
        order: ["Same candle", "Next candle", "Delay +2", "Delay +3", "Delay 4+", "Unknown"],
    },
    {
        key: "rTarget",
        title: "R Target",
        getLabel: (t) => {
            const v = t.rr_config ?? t.rrConfig ?? t.rr_multiple ?? t.rr;
            if (v == null || v === "") return "Unknown";
            const n = Number(v);
            return Number.isFinite(n) ? `${n}R` : "Unknown";
        },
    },
    {
        key: "stopBuffer",
        title: "Stop Buffer",
        getLabel: (t) => {
            const v = t.stop_buffer ?? t.stopBuffer ?? t.stop_buffer_pips;
            if (v == null || v === "") return "Unknown";
            const n = Number(v);
            if (!Number.isFinite(n)) return "Unknown";
            if (n === 0) return "No buffer";
            if (n <= 0.005) return "0–0.5%";
            return "0.5%+";
        },
        order: ["No buffer", "0–0.5%", "0.5%+", "Unknown"],
    },
    {
        key: "protection",
        title: "BE / Trailing",
        getLabel: (t) => {
            const v = String(t.protection_mode || t.protectionMode || "").toLowerCase();
            if (!v || v === "none") return "None";
            if (v === "move_to_be" || v === "movetobe") return "Move to BE";
            if (v === "trailing") return "Trailing";
            // Title-case fallback
            return v.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
        },
        order: ["None", "Move to BE", "Trailing"],
    },
    {
        key: "cancellation",
        title: "Cancellation Reason",
        getLabel: (t) => {
            const v = String(t.cancellation_reason || t.cancellationReason || "").toLowerCase().trim();
            if (!v || v === "none" || v === "n/a") return "None";
            if (v === "first_failed_tag" || v === "firstfailedtag") return "First failed tag";
            if (v === "retrace") return "Retrace";
            return v.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
        },
    },
    // ── OB origin fields — rendered when data is available ──────────────────
    {
        key: "obOriginSession",
        title: "OB Origin Session",
        getLabel: (t) =>
            String(t.obOriginSession || t.ob_origin_session || "").trim() || "Unknown",
    },
    {
        key: "obDetectionSession",
        title: "OB Detection Session",
        getLabel: (t) =>
            String(t.obDetectionSession || t.ob_detection_session || "").trim() || "Unknown",
    },
];

// ── Bucket row builder ────────────────────────────────────────────────────────

/**
 * Builds an array of canonical bucket rows from a group map.
 * Compatible with CanonicalBucketTable rawRows shape.
 *
 * @param {Map<string, object[]>} groupMap  label → trade[]
 * @param {string[]} [order]  preferred label order
 * @returns {object[]} rawRows
 */
function buildBucketRows(groupMap, order) {
    const makeRow = (label, trades) => {
        const wins = trades.filter(isWin).length;
        const losses = trades.filter(isLoss).length;
        const decided = wins + losses;
        const netR = trades.reduce((s, t) => s + getR(t), 0);
        const grossWin = trades.filter((t) => getR(t) > 0).reduce((s, t) => s + getR(t), 0);
        const grossLoss = trades.filter((t) => getR(t) < 0).reduce((s, t) => s + Math.abs(getR(t)), 0);
        return {
            label,
            rows: trades.length,
            count: trades.length,
            wins,
            losses,
            flats: trades.length - wins - losses,
            netR: Number(netR.toFixed(2)),
            winRate: decided > 0 ? Number(((wins / decided) * 100).toFixed(1)) : null,
            expectancy: trades.length > 0 ? Number((netR / trades.length).toFixed(3)) : null,
            profitFactor: grossLoss > 0 ? Number((grossWin / grossLoss).toFixed(2)) : null,
            tradeRefs: trades,
        };
    };

    const seen = new Set();
    const rows = [];

    // Ordered entries first
    if (order) {
        for (const label of order) {
            if (groupMap.has(label)) {
                seen.add(label);
                rows.push(makeRow(label, groupMap.get(label)));
            }
        }
    }

    // Remaining keys in insertion order
    for (const [label, trades] of groupMap.entries()) {
        if (!seen.has(label)) {
            rows.push(makeRow(label, trades));
        }
    }

    return rows;
}

/**
 * Groups trades by a label function into a Map.
 * @param {object[]} trades
 * @param {function} getLabelFn
 * @returns {Map<string, object[]>}
 */
function groupBy(trades, getLabelFn) {
    const map = new Map();
    for (const trade of trades) {
        const label = String(getLabelFn(trade));
        if (!map.has(label)) map.set(label, []);
        map.get(label).push(trade);
    }
    return map;
}

// ── Core metric calculations ──────────────────────────────────────────────────

/**
 * Compute the running maximum drawdown for a sequence of R values.
 * Returns a negative number (or 0).
 *
 * @param {number[]} rValues
 * @returns {number}
 */
function computeMaxDrawdown(rValues) {
    let peak = 0;
    let cum = 0;
    let maxDD = 0;
    for (const r of rValues) {
        cum += r;
        if (cum > peak) peak = cum;
        const dd = cum - peak;
        if (dd < maxDD) maxDD = dd;
    }
    return Number(maxDD.toFixed(2));
}

/**
 * Compute the longest consecutive losing streak.
 *
 * @param {object[]} trades
 * @returns {number}
 */
function computeLongestStreak(trades) {
    let max = 0;
    let cur = 0;
    for (const t of trades) {
        if (getR(t) < 0) {
            cur += 1;
            if (cur > max) max = cur;
        } else {
            cur = 0;
        }
    }
    return max;
}

/**
 * Applies a direction filter to a trade array.
 *
 * @param {object[]} trades
 * @param {"both"|"long"|"short"} direction
 * @returns {object[]}
 */
export function filterByDirection(trades, direction) {
    if (!direction || direction === "both") return trades;
    const target = direction === "long" ? "Long" : "Short";
    return trades.filter((t) => normalizeDirection(t) === target);
}

// ── Verdict logic ─────────────────────────────────────────────────────────────

/**
 * Determines a verdict for a session based on P0 metrics.
 *
 * "Strong"    → netR > 0 AND winRate > 52 AND profitFactor > 1.5
 * "Avoid"     → netR < 0 OR winRate < 40 OR maxDD < -8
 * "Selective" → everything else
 *
 * @param {{ netR, winRate, profitFactor, maxDD }} metrics
 * @returns {"Strong"|"Selective"|"Avoid"|"No Data"}
 */
export function computeVerdict({ netR, winRate, profitFactor, maxDD, tradeCount }) {
    if (!tradeCount || tradeCount === 0) return "No Data";
    if (netR < 0 || winRate < 40 || maxDD < -8) return "Avoid";
    if (netR > 0 && winRate > 52 && profitFactor > 1.5) return "Strong";
    return "Selective";
}

// ── Main analytics exports ────────────────────────────────────────────────────

/**
 * Computes P0 + P1 metrics for a specific session and direction filter.
 *
 * @param {object[]} allTrades
 * @param {string} session  — session key
 * @param {"both"|"long"|"short"} direction
 * @returns {object} metrics object
 */
export function computeSessionMetrics(allTrades, session, direction = "both") {
    const sessionTrades = allTrades.filter((t) => resolveSession(t) === session);
    const dirTrades = filterByDirection(sessionTrades, direction);

    const tradeCount = dirTrades.length;
    if (tradeCount === 0) {
        return {
            tradeCount: 0,
            wins: 0,
            losses: 0,
            netR: 0,
            winRate: null,
            expectancy: null,
            profitFactor: null,
            maxDD: 0,
            longestStreak: 0,
            longNetR: null,
            shortNetR: null,
            avgTimeToStopout: null,
            avgTimeToTarget: null,
            verdict: "No Data",
        };
    }

    const wins = dirTrades.filter(isWin).length;
    const losses = dirTrades.filter(isLoss).length;
    const decided = wins + losses;
    const netR = Number(dirTrades.reduce((s, t) => s + getR(t), 0).toFixed(2));
    const winRate = decided > 0 ? Number(((wins / decided) * 100).toFixed(1)) : null;
    const expectancy = Number((netR / tradeCount).toFixed(3));
    const grossWin = dirTrades.filter((t) => getR(t) > 0).reduce((s, t) => s + getR(t), 0);
    const grossLoss = dirTrades.filter((t) => getR(t) < 0).reduce((s, t) => s + Math.abs(getR(t)), 0);
    const profitFactor = grossLoss > 0 ? Number((grossWin / grossLoss).toFixed(2)) : null;
    const maxDD = computeMaxDrawdown(dirTrades.map(getR));
    const longestStreak = computeLongestStreak(dirTrades);

    // Long / short sub-metrics (always from session trades regardless of direction filter)
    const longTrades = sessionTrades.filter((t) => normalizeDirection(t) === "Long");
    const shortTrades = sessionTrades.filter((t) => normalizeDirection(t) === "Short");
    const longNetR = longTrades.length
        ? Number(longTrades.reduce((s, t) => s + getR(t), 0).toFixed(2))
        : null;
    const shortNetR = shortTrades.length
        ? Number(shortTrades.reduce((s, t) => s + getR(t), 0).toFixed(2))
        : null;

    // Time to exit (proxy for time-to-stop / time-to-target)
    const getMinutes = (t) => {
        const v = t.minutes_to_exit ?? t.minutesToExit ?? t.bars_to_exit ?? null;
        return v != null ? Number(v) : null;
    };
    const stopouts = dirTrades.filter(isLoss).map(getMinutes).filter((v) => v != null);
    const targets = dirTrades.filter(isWin).map(getMinutes).filter((v) => v != null);
    const avgTimeToStopout = stopouts.length
        ? Number((stopouts.reduce((s, v) => s + v, 0) / stopouts.length).toFixed(1))
        : null;
    const avgTimeToTarget = targets.length
        ? Number((targets.reduce((s, v) => s + v, 0) / targets.length).toFixed(1))
        : null;

    const verdict = computeVerdict({ netR, winRate, profitFactor, maxDD, tradeCount });

    return {
        tradeCount,
        wins,
        losses,
        netR,
        winRate,
        expectancy,
        profitFactor,
        maxDD,
        longestStreak,
        longNetR,
        shortNetR,
        avgTimeToStopout,
        avgTimeToTarget,
        verdict,
    };
}

/**
 * Builds one profile per session key.
 * Each profile contains the computed metrics + the filtered session trades.
 *
 * @param {object[]} allTrades
 * @param {"both"|"long"|"short"} direction
 * @returns {object[]} array of { session, metrics, sessionTrades }
 */
export function buildSessionProfiles(allTrades, direction = "both") {
    return SESSION_KEYS.map((session) => {
        const sessionTrades = filterByDirection(
            allTrades.filter((t) => resolveSession(t) === session),
            direction
        );
        const metrics = computeSessionMetrics(allTrades, session, direction);
        return { session, metrics, sessionTrades };
    });
}

/**
 * Builds rows compatible with CanonicalBucketTable rawRows for a session
 * comparison table (one row per session).
 *
 * @param {object[]} profiles  — from buildSessionProfiles()
 * @returns {object[]} rawRows
 */
export function buildSessionComparisonRows(profiles) {
    return profiles
        .filter((p) => p.metrics.tradeCount > 0)
        .map((p) => {
            const { metrics, session } = p;
            return {
                label: session,
                rows: metrics.tradeCount,
                count: metrics.tradeCount,
                wins: metrics.wins,
                losses: metrics.losses,
                flats: metrics.tradeCount - metrics.wins - metrics.losses,
                netR: metrics.netR,
                winRate: metrics.winRate,
                expectancy: metrics.expectancy,
                profitFactor: metrics.profitFactor,
                tradeRefs: p.sessionTrades,
            };
        });
}

/**
 * Builds all breakdown bucket arrays for a given set of session trades.
 * Returns an object keyed by breakdown def key.
 *
 * @param {object[]} sessionTrades
 * @returns {{ defs: object[], bucketsByKey: object }}
 */
export function buildSessionBreakdowns(sessionTrades) {
    const bucketsByKey = {};

    for (const def of SESSION_BREAKDOWN_DEFS) {
        const groupMap = groupBy(sessionTrades, def.getLabel);
        const rows = buildBucketRows(groupMap, def.order);
        // Only include breakdowns that have at least 2 non-empty buckets
        const populated = rows.filter((r) => r.rows > 0);
        if (populated.length >= 1) {
            bucketsByKey[def.key] = rows;
        }
    }

    return { defs: SESSION_BREAKDOWN_DEFS, bucketsByKey };
}

/**
 * Builds hourly and weekday analytics for a set of session trades.
 *
 * Hourly stats: array of 24 entries { hour, netR, wins, losses, count }
 * Weekday stats: array of 7 entries { day, label, netR, wins, losses, count, winRate }
 *
 * @param {object[]} sessionTrades
 * @returns {{ hourlyStats: object[], weekdayStats: object[] }}
 */
export function buildSessionTimeProfile(sessionTrades) {
    // Hourly stats (UTC hours 0–23)
    const hourlyMap = new Map();
    for (let h = 0; h < 24; h++) {
        hourlyMap.set(h, { hour: h, netR: 0, wins: 0, losses: 0, count: 0 });
    }
    for (const trade of sessionTrades) {
        const ts = trade.entry;
        if (!ts) continue;
        const d = new Date(typeof ts === "number" && ts < 1e10 ? ts * 1000 : ts);
        if (!isFinite(d.getTime())) continue;
        const h = d.getUTCHours();
        const bucket = hourlyMap.get(h);
        if (!bucket) continue;
        bucket.count += 1;
        bucket.netR = Number((bucket.netR + getR(trade)).toFixed(2));
        if (isWin(trade)) bucket.wins += 1;
        if (isLoss(trade)) bucket.losses += 1;
    }
    const hourlyStats = Array.from(hourlyMap.values()).map((b) => ({
        ...b,
        label: `${String(b.hour).padStart(2, "0")}:00`,
        winRate: b.wins + b.losses > 0
            ? Number(((b.wins / (b.wins + b.losses)) * 100).toFixed(1))
            : null,
    }));

    // Weekday stats (0=Sun … 6=Sat)
    const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const weekdayMap = new Map();
    for (let d = 0; d < 7; d++) {
        weekdayMap.set(d, { day: d, label: WEEKDAY_LABELS[d], netR: 0, wins: 0, losses: 0, count: 0 });
    }
    for (const trade of sessionTrades) {
        const ts = trade.entry;
        if (!ts) continue;
        const d = new Date(typeof ts === "number" && ts < 1e10 ? ts * 1000 : ts);
        if (!isFinite(d.getTime())) continue;
        const wd = d.getUTCDay();
        const bucket = weekdayMap.get(wd);
        if (!bucket) continue;
        bucket.count += 1;
        bucket.netR = Number((bucket.netR + getR(trade)).toFixed(2));
        if (isWin(trade)) bucket.wins += 1;
        if (isLoss(trade)) bucket.losses += 1;
    }
    const weekdayStats = Array.from(weekdayMap.values())
        .filter((b) => b.count > 0)
        .map((b) => ({
            ...b,
            winRate: b.wins + b.losses > 0
                ? Number(((b.wins / (b.wins + b.losses)) * 100).toFixed(1))
                : null,
            expectancy: b.count > 0 ? Number((b.netR / b.count).toFixed(3)) : null,
        }));

    return { hourlyStats, weekdayStats };
}

/**
 * Builds a cumulative R equity curve array for a set of trades.
 * Returns [{ i, netR }] for use with recharts or EquityCurve.
 *
 * @param {object[]} trades
 * @returns {object[]}
 */
export function buildSessionEquityCurve(trades) {
    let cum = 0;
    return trades.map((t, i) => {
        cum = Number((cum + getR(t)).toFixed(2));
        return { i, netR: cum, v: cum };
    });
}
