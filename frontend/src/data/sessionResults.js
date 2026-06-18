// sessionResults.js — Session Results / Scenario Impact (Phase 1, read-only).
//
// PURE: crosses the fixed 6×4 scenario grid (sessions × cohorts) with the
// imported trade rows of a scenario run, so every session and cohort is ALWAYS
// represented — executed trades, scenario-disabled opportunities, and enabled
// cohorts with no trades alike. No store/importer/backend coupling; callers pass
// the trade list + the run's session_strategy_scenario config.
//
// Counting model:
//   • executed   = classifyTrade(t) ∈ PERFORMANCE_CATEGORIES (real fills)
//   • disabled   = outcomeRaw "COHORT_DISABLED" OR missed_reason "cohort_disabled"
//   • everything else (UNFILLED / SESSION_FILTERED / news cancels / invalid) is
//     neither — not shown as executed, not shown as a scenario-blocked row.
//   • stats (net R / win rate / avg) are computed from EXECUTED rows only;
//     disabled opportunities are NEVER counted as wins/losses/netR.
//
// Scenario status + TP/BE settings come from scenarioConfig.cohorts (authoritative
// per-cohort, incl. the ny_pm split which the legacy fill_session label lacks).

import { SESSIONS, CELLS, SESSION_KEYS, CELL_KEYS, cohortOf } from "./sessionProfiles";
import { classifyTrade, PERFORMANCE_CATEGORIES } from "./tradeClassification";

const sessionLabelOf = (k) => SESSIONS.find((s) => s.key === k)?.label || k;
const cellMeta = (k) => CELLS.find((c) => c.key === k) || { key: k, label: k, structure: "", direction: "" };

function isDisabledRow(t) {
    return String(t?.outcomeRaw || "").toUpperCase() === "COHORT_DISABLED"
        || String(t?.missed_reason || t?.missedReason || "").toLowerCase() === "cohort_disabled";
}
function isExecutedRow(t) {
    return PERFORMANCE_CATEGORIES.has(classifyTrade(t));
}
function tradeR(t) {
    const v = Number(t?.netR ?? t?.net_r ?? t?.pnl_r ?? t?.r ?? 0);
    return Number.isFinite(v) ? v : 0;
}
function rrOf(t) {
    const v = Number(t?.rr_multiple ?? t?.rr ?? t?.rrMultiple);
    return Number.isFinite(v) ? v : null;
}

function tpLabelFromRule(rule) {
    if (rule && rule.target && rule.target.rr != null) return `${rule.target.rr}R`;
    return "Run Default";
}
function beLabelFromRule(rule) {
    if (rule && rule.be && rule.be.arm_r != null) return `${rule.be.arm_r}R ${rule.be.trigger || ""}`.trim();
    return "Run Default";
}
function entryLabelFromRule(rule) {
    const e = rule && rule.entry;
    if (!e || !e.model) return "Run Default";
    if (e.model === "baseline") return "Baseline";
    if (e.model === "triggered_edge") {
        const arm = String(e.arm ?? e.fill_mode ?? "");
        const c = arm === "same" ? "C0" : arm === "next" ? "C1" : /^d\d+$/.test(arm) ? `C${arm.slice(1)}` : arm;
        return `Triggered Edge ${e.threshold}${c ? ` ${c}` : ""}`;
    }
    if (e.model === "penetration") return `Penetration ${e.threshold}`;
    return "Run Default";
}

function statsFor(executed) {
    let wins = 0, losses = 0, be = 0, netR = 0;
    for (const t of executed) {
        const cat = classifyTrade(t);
        if (cat === "WIN" || cat === "NEWS_FLATTEN_WIN") wins += 1;
        else if (cat === "LOSS" || cat === "NEWS_FLATTEN_LOSS") losses += 1;
        else be += 1; // BREAKEVEN / NEWS_FLATTEN_FLAT
        netR += tradeR(t);
    }
    const count = executed.length;
    const decided = wins + losses;
    return {
        count, wins, losses, be,
        netR: Number(netR.toFixed(2)),
        avgR: count ? Number((netR / count).toFixed(2)) : null,
        winRate: decided ? Number(((wins / decided) * 100).toFixed(1)) : null,
    };
}

/**
 * Build the full 6×4 Session Results structure (read-only).
 * @param {object[]} trades         imported trade rows (executed + disabled)
 * @param {object|null} scenarioConfig  run's session_strategy_scenario (or null)
 * @returns {{ hasScenario, meta, sessions:[...] }}
 */
export function buildSessionResults(trades, scenarioConfig) {
    const list = Array.isArray(trades) ? trades : [];
    const hasScenario = !!(scenarioConfig && Array.isArray(scenarioConfig.cohorts) && scenarioConfig.cohorts.length);

    // Per-cohort rule lookup keyed "session|Structure|Direction" (authoritative).
    const ruleBy = new Map();
    if (hasScenario) {
        for (const co of scenarioConfig.cohorts) {
            if (co && typeof co === "object") ruleBy.set(`${co.session}|${co.structure}|${co.direction}`, co);
        }
    }

    // Group rows by cohort id "session|cell" (read-only; never mutates rows). Three
    // mutually-exclusive buckets cover every row: executed | disabled | cancelled-
    // or-missed (neither a real fill nor a scenario disable). Cancelled/missed rows
    // usually have a BLANK fill_session (they never filled), so cohortOf maps them
    // to "unknown|…" → they go to the session-agnostic `unassigned` bucket rather
    // than being mis-assigned to a session.
    const SESSION_SET = new Set(SESSION_KEYS);
    const push = (map, k, t) => { if (!map.has(k)) map.set(k, []); map.get(k).push(t); };
    const exByCohort = new Map();
    const disByCohort = new Map();
    const cmByCohort = new Map();
    const unassigned = [];
    for (const t of list) {
        const ck = cohortOf(t); // "session|cell" or "unknown|cell"
        if (isDisabledRow(t)) {
            push(disByCohort, ck, t);
        } else if (isExecutedRow(t)) {
            push(exByCohort, ck, t);
        } else {
            // cancelled / missed / unfilled / invalid / news-cancelled / open
            if (SESSION_SET.has(ck.split("|")[0])) push(cmByCohort, ck, t);
            else unassigned.push(t);
        }
    }

    const sessions = SESSION_KEYS.map((sKey) => {
        const cohorts = CELL_KEYS.map((cKey) => {
            const cm = cellMeta(cKey);
            const ck = `${sKey}|${cKey}`;
            const executed = exByCohort.get(ck) || [];
            const disabled = disByCohort.get(ck) || [];
            const cancelledMissed = cmByCohort.get(ck) || [];
            const rule = ruleBy.get(`${sKey}|${cm.structure}|${cm.direction}`) || null;
            const status = rule ? (rule.enabled === false ? "disabled" : "enabled") : "enabled";
            const st = statsFor(executed);
            return {
                key: cKey,                    // cell key (e.g. "bos_long"); unique within a session
                cellKey: cKey,
                label: cm.label,
                structure: cm.structure,
                direction: cm.direction,
                status,                       // "enabled" | "disabled" (from config)
                hasRule: !!rule,
                entryLabel: entryLabelFromRule(rule),
                tpLabel: tpLabelFromRule(rule),
                beLabel: beLabelFromRule(rule),
                executedCount: executed.length,
                disabledCount: disabled.length,
                cancelledMissedCount: cancelledMissed.length,
                netR: st.netR,
                summary: st,                  // full per-cohort stats (executed only)
                // Canonical drilldown row sets — three mutually-exclusive buckets.
                executedTrades: executed,
                disabledOpportunities: disabled,
                cancelledOrMissedOpportunities: cancelledMissed,
                allRows: [...executed, ...disabled, ...cancelledMissed],
                // Back-compat aliases for existing consumers.
                executed,
                disabled,
            };
        });

        // Session summary from cohort stats.
        const allExecuted = cohorts.flatMap((c) => c.executed);
        const summaryStats = statsFor(allExecuted);
        const disabledOpportunities = cohorts.reduce((n, c) => n + c.disabledCount, 0);
        const cancelledMissed = cohorts.reduce((n, c) => n + c.cancelledMissedCount, 0);
        const disabledCohorts = cohorts.filter((c) => c.status === "disabled").length;
        const activeCohorts = cohorts.length - disabledCohorts;

        return {
            key: sKey,
            label: sessionLabelOf(sKey),
            summary: {
                executed: summaryStats.count,
                disabledOpportunities,
                cancelledMissed,
                wins: summaryStats.wins,
                losses: summaryStats.losses,
                be: summaryStats.be,
                netR: summaryStats.netR,
                avgR: summaryStats.avgR,
                winRate: summaryStats.winRate,
                activeCohorts,
                disabledCohorts,
            },
            cohorts,
        };
    });

    return {
        hasScenario,
        meta: (scenarioConfig && scenarioConfig.meta) || null,
        sessions,
        // Cancelled/missed rows with no recorded fill session (could not be mapped
        // to a session). Surfaced separately so they are never lost or mis-assigned.
        unassigned,
        unassignedCount: unassigned.length,
    };
}

// Arm/delay number for a triggered-edge row. Use the CONFIGURED variant arm from
// entry_model_key (_d6 → 6, _next → 1, _same → 0) — NOT fill_delay_candles, which
// is the realized delay at fill (0/blank for never-filled cancelled rows, so it
// reads 0 for every variant). fill_delay_candles is only a last-resort fallback.
function armNumber(t) {
    const key = String(t?.entry_model_key || "");
    const m = key.match(/_d(\d+)\b/);
    if (m) return Number(m[1]);
    if (/_next\b/.test(key)) return 1;
    if (/_same\b/.test(key)) return 0;
    const d = Number(t?.fill_delay_candles ?? t?.fillDelayCandles);
    if (Number.isFinite(d)) return d;
    return null;
}
function numTokOrNull(v) {
    const n = Number(v);
    return Number.isFinite(n) ? String(n) : null;
}
// Short entry-model context for a row, e.g. "TrigE 25 Arm 6", "Pen 50", "Baseline".
function entryContext(t) {
    const model = String(t?.entry_model || t?.entry_family || "").toLowerCase();
    const thr = numTokOrNull(t?.entry_threshold_pct ?? t?.trigger_penetration_pct ?? t?.triggerPenetrationPct);
    if (model.includes("trigger")) {
        const arm = armNumber(t);
        return `TrigE${thr != null ? ` ${thr}` : ""}${arm != null ? ` Arm ${arm}` : ""}`.trim();
    }
    if (model.includes("penetration")) return `Pen${thr != null ? ` ${thr}` : ""}`.trim();
    if (model === "baseline") return "Baseline";
    return "";
}
// Human cause phrase for a cancelled/missed row, from explicit reason fields first,
// then falling back to the classifyTrade category. Never invents — defaults to the
// classified bucket name.
function causePhrase(t) {
    const raw = String(t?.cancel_reason || t?.cancelReason || t?.missed_reason || t?.missedReason || t?.outcomeRaw || t?.outcome || "").toLowerCase();
    if (raw.includes("first_failed") || raw.includes("failed_tag")) return "First failed tag";
    if (raw.includes("news_touch")) return "News touch cancel";
    if (raw.includes("blackout")) return "News blackout";
    if (raw.includes("session_filter")) return "Session filtered";
    if (raw.includes("reverse")) return "Reverse touch cancel";
    if (raw.includes("cohort_disabled")) return "Blocked by scenario";
    if (raw.includes("invalid")) return "Invalidated before entry";
    if (raw.includes("never_filled") || raw === "unfilled") return "Never filled";
    const cat = classifyTrade(t);
    if (cat === "UNFILLED") return "Never filled";
    if (cat === "NEWS_CANCELLED") return "News cancelled";
    if (cat === "INVALID_CANCELLED") return "Invalidated before entry";
    if (cat === "SESSION_FILTERED") return "Session filtered";
    if (cat === "OPEN") return "Still open at data end";
    return "Cancelled";
}
/**
 * Specific, readable reason for a cancelled/missed row, e.g.
 *   "Invalidated before entry - TrigE 25 Arm 6"
 *   "Never filled - TrigE Arm 2"
 *   "Session filtered"
 * Composes a cause phrase with the row's entry-model context when available.
 * Pure; uses only fields already on the row.
 */
export function describeMissedReason(t) {
    const cause = causePhrase(t);
    const ctx = entryContext(t);
    return ctx ? `${cause} - ${ctx}` : cause;
}

/**
 * Phase 3A — pure outcome distribution over a cohort's EXECUTED trades only.
 * Buckets are derived from classifyTrade (single source of truth); nothing is
 * invented. Returns { total, buckets:[{key,label,count,percent,netR,avgR}] } with
 * only non-empty buckets, in a stable order. Disabled/cancelled rows are never
 * passed in, so they never appear here.
 */
export function cohortOutcomeDistribution(executedTrades) {
    const rows = Array.isArray(executedTrades) ? executedTrades : [];
    const total = rows.length;
    const byCat = new Map();
    for (const t of rows) {
        const c = classifyTrade(t);
        if (!byCat.has(c)) byCat.set(c, []);
        byCat.get(c).push(t);
    }
    const defs = [
        { key: "win", label: "Wins", cats: ["WIN"] },
        { key: "loss", label: "Losses", cats: ["LOSS"] },
        { key: "be", label: "Break Even", cats: ["BREAKEVEN"] },
        { key: "news_flatten", label: "News Flatten", cats: ["NEWS_FLATTEN_WIN", "NEWS_FLATTEN_LOSS", "NEWS_FLATTEN_FLAT"] },
    ];
    const used = new Set();
    const mkBucket = (key, label, items) => {
        const netR = items.reduce((s, t) => s + tradeR(t), 0);
        return {
            key, label,
            count: items.length,
            percent: total ? Number(((items.length / total) * 100).toFixed(1)) : 0,
            netR: Number(netR.toFixed(2)),
            avgR: items.length ? Number((netR / items.length).toFixed(2)) : null,
        };
    };
    const buckets = [];
    for (const d of defs) {
        d.cats.forEach((c) => used.add(c));
        const items = d.cats.flatMap((c) => byCat.get(c) || []);
        if (items.length) buckets.push(mkBucket(d.key, d.label, items));
    }
    const other = rows.filter((t) => !used.has(classifyTrade(t)));
    if (other.length) buckets.push(mkBucket("other", "Other", other));
    return { total, buckets };
}

/**
 * Phase 2B — pure, cohort-scoped failure summary computed ONLY from a cohort's
 * executed trades (real fills). Disabled/COHORT_DISABLED rows are never passed in,
 * so they can never count as losses. Uses classifyTrade (single source of truth)
 * for loss detection; never invents failure classifications — `topReasons` is
 * populated only from explicit reason fields present on the rows.
 */
export function cohortFailureSummary(executedTrades) {
    const rows = Array.isArray(executedTrades) ? executedTrades : [];
    const losses = rows.filter((t) => {
        const c = classifyTrade(t);
        return c === "LOSS" || c === "NEWS_FLATTEN_LOSS";
    });
    const totalLosses = losses.length;
    let lossR = 0, largest = 0;
    for (const t of losses) {
        const r = tradeR(t);
        lossR += r;
        if (r < largest) largest = r;
    }
    const beExits = rows.filter((t) => String(t?.outcomeRaw || "").toUpperCase() === "BE_EXIT").length;

    // Explicit reason fields only (never fabricated). Most plain stop-outs carry no
    // reason → topReasons stays empty and the UI omits the section.
    const reasonCounts = {};
    for (const t of losses) {
        const reason = String(t?.cancel_reason || t?.exit_reason || t?.be_exit_reason || "").trim();
        if (reason) reasonCounts[reason] = (reasonCounts[reason] || 0) + 1;
    }
    const topReasons = Object.entries(reasonCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([reason, count]) => ({ reason, count }));

    return {
        executed: rows.length,
        totalLosses,
        lossR: Number(lossR.toFixed(2)),
        avgLossR: totalLosses ? Number((lossR / totalLosses).toFixed(2)) : null,
        largestLossR: totalLosses ? Number(largest.toFixed(2)) : null,
        lossRate: rows.length ? Number(((totalLosses / rows.length) * 100).toFixed(1)) : null,
        beExits,
        topReasons,
        losses,
    };
}
