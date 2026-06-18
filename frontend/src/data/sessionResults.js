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

    // Group rows by cohort id "session|cell" (read-only; never mutates rows).
    const exByCohort = new Map();
    const disByCohort = new Map();
    for (const t of list) {
        const ck = cohortOf(t); // "session|cell" or "unknown|..."
        if (isDisabledRow(t)) {
            if (!disByCohort.has(ck)) disByCohort.set(ck, []);
            disByCohort.get(ck).push(t);
        } else if (isExecutedRow(t)) {
            if (!exByCohort.has(ck)) exByCohort.set(ck, []);
            exByCohort.get(ck).push(t);
        }
        // else: other excluded categories — intentionally not surfaced here.
    }

    const sessions = SESSION_KEYS.map((sKey) => {
        const cohorts = CELL_KEYS.map((cKey) => {
            const cm = cellMeta(cKey);
            const ck = `${sKey}|${cKey}`;
            const executed = exByCohort.get(ck) || [];
            const disabled = disByCohort.get(ck) || [];
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
                netR: st.netR,
                summary: st,                  // full per-cohort stats (executed only)
                // Canonical drilldown row sets (executed never includes disabled).
                executedTrades: executed,
                disabledOpportunities: disabled,
                allRows: [...executed, ...disabled],
                // Back-compat aliases for existing consumers.
                executed,
                disabled,
            };
        });

        // Session summary from cohort stats.
        const allExecuted = cohorts.flatMap((c) => c.executed);
        const summaryStats = statsFor(allExecuted);
        const disabledOpportunities = cohorts.reduce((n, c) => n + c.disabledCount, 0);
        const disabledCohorts = cohorts.filter((c) => c.status === "disabled").length;
        const activeCohorts = cohorts.length - disabledCohorts;

        return {
            key: sKey,
            label: sessionLabelOf(sKey),
            summary: {
                executed: summaryStats.count,
                disabledOpportunities,
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

    return { hasScenario, meta: (scenarioConfig && scenarioConfig.meta) || null, sessions };
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
