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

// 4-Layer P0 — cohort primitives now come from the neutral cohortKeys.js (no overlay
// dependency); identical exports, byte-identical behaviour.
import { SESSIONS, CELLS, SESSION_KEYS, CELL_KEYS, cohortOf } from "./cohortKeys";
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
    let wins = 0, losses = 0, be = 0, netR = 0, sumPos = 0, sumNeg = 0;
    for (const t of executed) {
        const cat = classifyTrade(t);
        if (cat === "WIN" || cat === "NEWS_FLATTEN_WIN") wins += 1;
        else if (cat === "LOSS" || cat === "NEWS_FLATTEN_LOSS") losses += 1;
        else be += 1; // BREAKEVEN / NEWS_FLATTEN_FLAT
        const r = tradeR(t);
        netR += r;
        if (r > 0) sumPos += r;
        else if (r < 0) sumNeg += r;
    }
    const count = executed.length;
    const decided = wins + losses;
    // Profit factor: gross profit / gross loss. null when there is no loss R to
    // divide by (UI renders ∞ when wins exist, else —). EXACT from executed R.
    const pf = sumNeg !== 0 ? Number((sumPos / Math.abs(sumNeg)).toFixed(2)) : null;
    return {
        count, wins, losses, be,
        netR: Number(netR.toFixed(2)),
        avgR: count ? Number((netR / count).toFixed(2)) : null,
        winRate: decided ? Number(((wins / decided) * 100).toFixed(1)) : null,
        pf,
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

// Excursion field getters (R units). null when absent (old bundles).
const mfeOf = (t) => { const n = Number(t?.mfeR ?? t?.mfe_r); return Number.isFinite(n) ? n : null; };
const maeOf = (t) => { const n = Number(t?.maeR ?? t?.mae_r); return Number.isFinite(n) ? n : null; };
// Adverse excursion measured to the ORIGINAL exit (can dip below −1R for winners
// after the realised exit). Used by BE / risk-reduction BOUND estimates. Null in
// old bundles → bounded fields degrade to "unavailable".
const maeToExitOf = (t) => { const n = Number(t?.maeRToOriginalExit ?? t?.mae_r_to_original_exit); return Number.isFinite(n) ? n : null; };
function _avg(arr) { return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null; }
function _median(arr) {
    if (!arr.length) return null;
    const s = [...arr].sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
function _round2(v) { return v == null ? null : Number(v.toFixed(2)); }
function excGroup(rows) {
    const mfe = rows.map(mfeOf).filter((v) => v != null);
    const mae = rows.map(maeOf).filter((v) => v != null);
    return {
        count: rows.length,
        avgMFE: _round2(_avg(mfe)),
        medianMFE: _round2(_median(mfe)),
        avgMAE: _round2(_avg(mae)),
        medianMAE: _round2(_median(mae)),
    };
}

/**
 * Phase 3B — pure excursion snapshot over a cohort's EXECUTED trades only.
 * Exploratory (not simulation): summarizes MFE/MAE for all/winners/losers, and —
 * for LOSS trades only — the % that reached each R level before failing (a BE/
 * target-suitability signal). Uses only fields already on the rows; groups with
 * no MFE/MAE data return null stats (rendered "—"). Winners = classifyTrade WIN,
 * losers = classifyTrade LOSS.
 */
export function cohortExcursionSnapshot(executedTrades) {
    const rows = Array.isArray(executedTrades) ? executedTrades : [];
    const winners = rows.filter((t) => classifyTrade(t) === "WIN");
    const losers = rows.filter((t) => classifyTrade(t) === "LOSS");
    const thresholds = [0.5, 1.0, 1.5, 2.0].map((level) => {
        const reached = losers.filter((t) => { const m = mfeOf(t); return m != null && m >= level; }).length;
        return { level, reachedBeforeLossPct: losers.length ? Number(((reached / losers.length) * 100).toFixed(1)) : null };
    });
    return { all: excGroup(rows), winners: excGroup(winners), losers: excGroup(losers), thresholds };
}

/**
 * Phase 3C — pure target-suitability snapshot from exported MFE only. EXPLORATORY:
 * "how often did this cohort reach common R targets?" — NOT simulated P&L. A trade
 * "reached" a level when MFE >= level. Percentages use VALID-MFE denominators
 * (coverage), never `total`; winners/losers use their own valid-MFE denominators;
 * a zero denominator yields null. Disabled/cancelled rows are never passed in.
 */
// Target-suitability R levels shown in the Session Results → Management → Target
// Suitability table. Expanded (UI polish) to a fine-grained ladder. Consumers that
// look up specific levels (cohortManagementRead / cohortResearchVerdict via tsAt)
// still resolve 0.5/1/2/3 by exact match, so adding levels is non-breaking.
export const TARGET_SUITABILITY_LEVELS = [
    0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 1.25, 1.5, 1.75, 2.0,
    2.25, 2.5, 2.75, 3.0, 3.25, 3.5, 5.0,
];

export function cohortTargetSuitability(executedTrades, levels = TARGET_SUITABILITY_LEVELS) {
    const rows = Array.isArray(executedTrades) ? executedTrades : [];
    const total = rows.length;
    const withVal = rows.filter((t) => mfeOf(t) != null);
    const winnersV = withVal.filter((t) => classifyTrade(t) === "WIN");
    const losersV = withVal.filter((t) => classifyTrade(t) === "LOSS");
    const pct = (num, den) => (den ? Number(((num / den) * 100).toFixed(1)) : null);
    const reachedIn = (set, lvl) => set.filter((t) => mfeOf(t) >= lvl).length;
    const lv = levels.map((level) => {
        const reachedCount = reachedIn(withVal, level);
        const wc = reachedIn(winnersV, level);
        const lc = reachedIn(losersV, level);
        return {
            level,
            reachedCount, reachedPct: pct(reachedCount, withVal.length),
            winnersReachedCount: wc, winnersReachedPct: pct(wc, winnersV.length),
            losersReachedCount: lc, losersReachedPct: pct(lc, losersV.length),
        };
    });
    return {
        total,
        coverage: { withMFE: withVal.length, pct: pct(withVal.length, total) },
        winnersWithMFE: winnersV.length,
        losersWithMFE: losersV.length,
        levels: lv,
    };
}

/**
 * Parse a cohort's current-target label ("1.5R", "10R", "Run Default") into a
 * numeric R target, or null when it can't be parsed (e.g. "Run Default" / blank).
 * Used to anchor Δ-vs-current in the target-economics table.
 */
export function parseTargetLabel(label) {
    const m = /^\s*([0-9]*\.?[0-9]+)\s*R\s*$/i.exec(String(label ?? ""));
    if (!m) return null;
    const v = Number(m[1]);
    return Number.isFinite(v) && v > 0 ? v : null;
}

// Per-trade cost in R for EXACT net-R reconstruction. Prefer the exported
// total_cost_r; else derive from gross−net (net = gross − cost ⇒ cost = gross −
// net); else 0 (older bundles with neither — documented fallback, no cost model).
function costOf(t) {
    const c = Number(t?.totalCostR ?? t?.total_cost_r);
    if (Number.isFinite(c)) return c;
    const g = Number(t?.grossR ?? t?.gross_r);
    const n = Number(t?.netR ?? t?.net_r);
    if (Number.isFinite(g) && Number.isFinite(n)) return g - n;
    return 0;
}

/**
 * Normalize a list of values to 0–100 bar widths (min→0, max→100) for an inline
 * strength cue. Handles negatives (min-max scaling) and the all-equal case
 * (range 0 → every value renders full). Non-finite entries map to 0.
 */
export function normalizeBars(values) {
    const nums = (Array.isArray(values) ? values : []).map((v) => (Number.isFinite(v) ? v : null));
    const valid = nums.filter((v) => v != null);
    if (!valid.length) return nums.map(() => 0);
    const min = Math.min(...valid), max = Math.max(...valid), range = max - min;
    return nums.map((v) => (v == null ? 0 : range <= 0 ? 100 : Number((((v - min) / range) * 100).toFixed(1))));
}

/**
 * Phase 5 — EXACT target re-targeting economics from stop-anchored MFE.
 *
 * Changing the take-profit target does NOT change the fill set, entry, or stop —
 * only where profit is taken — so the outcome at any target T is exact for the
 * existing trades: a trade wins iff `mfe_r >= T`, and
 *     netR(T) = Σ_decided[(T if mfe_r>=T else −1) − cost] + Σ_heldNF[actual netR].
 * Reconstruction runs over DECIDED rows (WIN/LOSS) that carry a valid MFE.
 * News-flatten rows can't be retargeted (flattened by news, not target/stop), so
 * they are held at their ACTUAL net R as a constant and never counted as Est W/L.
 * EXACT for this fill set — confirm with a backend scenario run before adopting.
 *
 * Returns everything `cohortTargetSuitability` returns (reach-rate columns kept,
 * additive) plus per-level `estW` / `estL` / `estNetR` / `deltaCurrent` /
 * `confidence`, a `bestLevel`, and a gated `insight` summary.
 */
export function cohortTargetEconomics(executedTrades, currentTargetLabel = null, levels = TARGET_SUITABILITY_LEVELS) {
    const rows = Array.isArray(executedTrades) ? executedTrades : [];
    const base = cohortTargetSuitability(rows, levels);

    // Retargetable set: WIN/LOSS with valid MFE. (winnersWithMFE + losersWithMFE)
    const decidedRows = rows.filter((t) => {
        const cat = classifyTrade(t);
        return (cat === "WIN" || cat === "LOSS") && mfeOf(t) != null;
    });
    const decided = decidedRows.length;

    // News-flatten rows: held at actual (cannot retarget). Included in BOTH Est
    // Net R and Est PF for consistency (same components feed both).
    const heldRows = rows.filter((t) => {
        const cat = classifyTrade(t);
        return cat === "NEWS_FLATTEN_WIN" || cat === "NEWS_FLATTEN_LOSS" || cat === "NEWS_FLATTEN_FLAT";
    });
    const heldNetR = heldRows.reduce((s, t) => s + tradeR(t), 0);

    // Exact reconstruction at target T. Each decided trade contributes
    // (T if mfe≥T else −1) − cost; held news-flatten rows contribute actual net R.
    const econAt = (T) => {
        if (T == null) return { netR: null, pf: null };
        let sum = 0, gp = 0, gl = 0;
        const add = (r) => { sum += r; if (r > 0) gp += r; else if (r < 0) gl += -r; };
        for (const t of decidedRows) add((mfeOf(t) >= T ? T : -1) - costOf(t));
        for (const t of heldRows) add(tradeR(t));
        return { netR: Number(sum.toFixed(2)), pf: gl > 0 ? Number((gp / gl).toFixed(2)) : null };
    };
    const netRAt = (T) => econAt(T).netR;

    const currentTarget = parseTargetLabel(currentTargetLabel);
    const currentEcon = econAt(currentTarget);
    const currentNetR = currentEcon.netR;
    const pctOrNull = (num, den) => (den ? Number(((num / den) * 100).toFixed(1)) : null);

    // Deterministic confidence: base on decision-relevant counts, force Low when a
    // level's own reach count is < 5 (a % off ≤4 trades is noise).
    const confidenceOf = (reachCount) => {
        if (reachCount < 5) return "Low";
        if (decided >= 40 || (base.winnersWithMFE >= 20 && base.losersWithMFE >= 10)) return "High";
        if (decided >= 15) return "Medium";
        return "Low";
    };
    // Sample-tier confidence ignoring per-level reach (for a current target that is
    // not one of the ladder levels).
    const decidedConfidence = (decided >= 40 || (base.winnersWithMFE >= 20 && base.losersWithMFE >= 10))
        ? "High" : decided >= 15 ? "Medium" : "Low";

    const lv = base.levels.map((l) => {
        const T = l.level;
        const estW = decidedRows.filter((t) => mfeOf(t) >= T).length;
        const estL = decided - estW;
        const e = econAt(T);
        const deltaCurrent = (currentNetR != null && e.netR != null)
            ? Number((e.netR - currentNetR).toFixed(2)) : null;
        return {
            ...l, estW, estL,
            estNetR: e.netR,
            estPF: e.pf,                       // null ⇒ no loss R (UI shows ∞ if estW>0)
            estWR: pctOrNull(estW, estW + estL),
            deltaCurrent, n: decided,
            confidence: confidenceOf(l.reachedCount),
        };
    });

    // Normalized Est Net R bar widths (0–100) for the inline strength cue.
    const bars = normalizeBars(lv.map((l) => l.estNetR));
    lv.forEach((l, i) => { l.netRBar = bars[i]; });

    // ── Candidate selection (all deterministic) ──────────────────────────────
    // PF rank: a target with no losing R (pf null but Est W>0) is treated as the
    // strongest PF; an empty/degenerate row sinks to the bottom.
    const pfRank = (l) => (l.estPF == null ? (l.estW > 0 ? Infinity : -1) : l.estPF);
    const mh = lv.filter((l) => l.confidence !== "Low" && l.estNetR != null);

    // Best Overall = highest Est Net R among Medium/High rows. null if all Low.
    let best = null;
    for (const l of mh) if (best == null || l.estNetR > best.estNetR) best = l;
    const bestIsCurrent = best != null && currentTarget != null && best.level === currentTarget;

    // Candidate pool for Conservative/Balanced = Med/High with Δ ≥ 0 (or Δ unknown).
    const pool = mh.filter((l) => l.deltaCurrent == null || l.deltaCurrent >= 0);
    // Conservative = strongest Est PF among the non-negative pool (tie → higher net R).
    let conservative = null;
    for (const l of pool) {
        if (conservative == null || pfRank(l) > pfRank(conservative)
            || (pfRank(l) === pfRank(conservative) && l.estNetR > conservative.estNetR)) conservative = l;
    }
    // Balanced = best combined rank of Est Net R and Est PF among the pool.
    let balanced = null;
    if (pool.length) {
        const byNet = [...pool].sort((a, b) => b.estNetR - a.estNetR);
        const byPf = [...pool].sort((a, b) => pfRank(b) - pfRank(a));
        const rankOf = (l) => byNet.indexOf(l) + byPf.indexOf(l);
        for (const l of pool) {
            if (balanced == null || rankOf(l) < rankOf(balanced)
                || (rankOf(l) === rankOf(balanced) && l.estNetR > balanced.estNetR)) balanced = l;
        }
    }
    // Aggressive = highest Est Net R regardless of confidence (curiosity only).
    let aggressive = null;
    for (const l of lv) if (l.estNetR != null && (aggressive == null || l.estNetR > aggressive.estNetR)) aggressive = l;
    const aggressiveIsLowConf = aggressive != null && aggressive.confidence === "Low";

    // ── Recommendation card payload ──────────────────────────────────────────
    let recommendation;
    if (decided < 8) {
        recommendation = { kind: "too_small", n: decided };
    } else if (!best) {
        recommendation = { kind: "none", n: decided };
    } else if (currentTarget != null && (bestIsCurrent || (best.deltaCurrent != null && best.deltaCurrent <= 0))) {
        const curEstW = decidedRows.filter((t) => mfeOf(t) >= currentTarget).length;
        recommendation = {
            kind: "current_best", level: currentTarget,
            estNetR: currentNetR, estPF: currentEcon.pf, estWR: pctOrNull(curEstW, decided),
            confidence: (lv.find((l) => l.level === currentTarget) || {}).confidence || decidedConfidence,
            n: decided,
        };
    } else {
        recommendation = {
            kind: "recommend", level: best.level, deltaCurrent: best.deltaCurrent,
            estNetR: best.estNetR, estPF: best.estPF, estWR: best.estWR,
            confidence: best.confidence, n: decided,
        };
    }

    // Gated insight summary (kept for back-compat; the card uses `recommendation`).
    let insight;
    if (decided < 8) {
        insight = { tone: "muted", text: `Sample too small (${decided}) for target guidance.` };
    } else if (!best) {
        insight = { tone: "neutral", text: "No target candidate clears the confidence bar." };
    } else if (currentTarget == null) {
        insight = { tone: "success", text: `Best estimated target: ${best.level}R (${best.confidence} confidence). Current target unknown — Δ unavailable. Backend validation recommended.` };
    } else if (bestIsCurrent) {
        insight = { tone: "neutral", text: "Current target appears strongest in this cohort. No higher-confidence improvement candidate found." };
    } else if (best.deltaCurrent != null && best.deltaCurrent > 0) {
        insight = { tone: "success", text: `Best target candidate: ${best.level}R (+${best.deltaCurrent}R vs current, ${best.confidence} confidence). Backend validation recommended.` };
    } else {
        insight = { tone: "neutral", text: "Current target appears strongest — no higher-R candidate clears the confidence bar." };
    }

    return {
        ...base,
        decided,
        currentTargetLabel: currentTargetLabel ?? null,
        currentTarget,
        currentNetR,
        currentPF: currentEcon.pf,
        heldNetR: Number(heldNetR.toFixed(2)),
        levels: lv,
        bestLevel: best ? best.level : null,
        bestIsCurrent,
        conservativeLevel: conservative ? conservative.level : null,
        balancedLevel: balanced ? balanced.level : null,
        aggressiveLevel: aggressive ? aggressive.level : null,
        aggressiveIsLowConf,
        recommendation,
        insight,
    };
}

/**
 * Compact cohort header counts for the Cohort Breakdown card/header.
 * Uses the app's canonical `classifyTrade` so W/L/NF match existing conventions:
 *   • won       = executed rows classified WIN
 *   • lost      = executed rows classified LOSS
 *   • newsFlat  = executed rows classified NEWS_FLATTEN_* (counted SEPARATELY from W/L)
 *   • invalidated = cancelled/missed rows classified INVALID_CANCELLED (e.g. INVALID /
 *                   invalidated_before_fill). Reads the cohort's existing row buckets.
 * Disabled opportunities live in their own bucket and are NEVER counted here.
 * BREAKEVEN executed rows are intentionally not folded into W/L (parity with statsFor's
 * separate `be`); they show in `trades` but not in W/L/NF/INV. No row is double-counted.
 */
export function cohortHeaderCounts(cohort) {
    const executed = Array.isArray(cohort?.executedTrades)
        ? cohort.executedTrades
        : (Array.isArray(cohort?.executed) ? cohort.executed : []);
    const cancelled = Array.isArray(cohort?.cancelledOrMissedOpportunities)
        ? cohort.cancelledOrMissedOpportunities
        : [];
    let won = 0, lost = 0, newsFlat = 0;
    for (const t of executed) {
        const cat = classifyTrade(t);
        if (cat === "WIN") won += 1;
        else if (cat === "LOSS") lost += 1;
        else if (cat === "NEWS_FLATTEN_WIN" || cat === "NEWS_FLATTEN_LOSS" || cat === "NEWS_FLATTEN_FLAT") newsFlat += 1;
    }
    let invalidated = 0;
    for (const t of cancelled) {
        if (classifyTrade(t) === "INVALID_CANCELLED") invalidated += 1;
    }
    return { trades: executed.length, won, lost, newsFlat, invalidated };
}

/**
 * Phase 3D — pure BE-suitability snapshot from exported MFE only. EXPLORATORY:
 * surfaces raw reach-rate evidence to gauge whether a BE rule might help — it does
 * NOT simulate P&L and makes no claim a BE would improve results. Reached = MFE >=
 * level. Percentages use valid-MFE denominators (winners/losers separately).
 *   netBenefitScore = losersReachedPct - (100 - winnersReachedPct)  // ranking aid only
 *   signal: Strong (losers>=50 & winners>=80) · Weak (losers<25) · Mixed otherwise
 */
export function cohortBESuitability(executedTrades, levels = [0.5, 1, 1.5, 2]) {
    const rows = Array.isArray(executedTrades) ? executedTrades : [];
    const winnersV = rows.filter((t) => classifyTrade(t) === "WIN" && mfeOf(t) != null);
    const losersV = rows.filter((t) => classifyTrade(t) === "LOSS" && mfeOf(t) != null);
    const pct = (num, den) => (den ? Number(((num / den) * 100).toFixed(1)) : null);
    const reachedIn = (set, lvl) => set.filter((t) => mfeOf(t) >= lvl).length;
    const signalOf = (lp, wp) => {
        if (lp == null || wp == null) return "—";
        if (lp >= 50 && wp >= 80) return "Strong";
        if (lp < 25) return "Weak";
        return "Mixed";
    };
    // BOUND inputs: BE outcome is path-order dependent (was the milestone hit
    // before the dip?), so these are worst/best-case bounds, never point P&L.
    // Requires mae_r_to_original_exit on winners; absent → bounds unavailable.
    const boundsAvailable = winnersV.some((t) => maeToExitOf(t) != null);
    const lv = levels.map((level) => {
        const lc = reachedIn(losersV, level);
        const wc = reachedIn(winnersV, level);
        const lp = pct(lc, losersV.length);
        const wp = pct(wc, winnersV.length);
        const netBenefitScore = (lp == null || wp == null) ? null : Number((lp - (100 - wp)).toFixed(1));
        // Saved bound (upper): each loser that reached `level` could exit at BE (0R)
        // instead of −1R → up to +1R saved. EXACT count, BOUND R.
        const savedRBound = Number((lc * 1).toFixed(2));
        // Lost bound (worst-case): winners that armed BE (mfe≥level) but whose adverse
        // path returned to BE (mae_to_exit ≤ 0) — they'd be cut to ~0R, giving up
        // their realised net R.
        let lostRBound = null, threatenedWinners = null, netImpactBound = null;
        if (boundsAvailable) {
            const threatened = winnersV.filter((t) => mfeOf(t) >= level && maeToExitOf(t) != null && maeToExitOf(t) <= 0);
            threatenedWinners = threatened.length;
            lostRBound = Number(threatened.reduce((s, t) => s + Math.max(0, tradeR(t)), 0).toFixed(2));
            netImpactBound = Number((savedRBound - lostRBound).toFixed(2));
        }
        return {
            level,
            losersReachedCount: lc, losersReachedPct: lp,
            winnersReachedCount: wc, winnersReachedPct: wp,
            netBenefitScore,
            signal: signalOf(lp, wp),
            savedRBound, threatenedWinners, lostRBound, netImpactBound,
        };
    });
    return { totalLosers: losersV.length, totalWinners: winnersV.length, boundsAvailable, levels: lv };
}

/**
 * Phase 3 — Risk-Reduction Suitability (NEW, separate from BE). Explores rules
 * like "after 0.25R → tighten stop to −0.75R". Same honesty as BE: every R figure
 * is a path-order-dependent BOUND, never simulated P&L.
 *   • Losers Reached    = LOSS rows with mfe_r ≥ trigger (EXACT count)
 *   • Winners Threatened = WIN rows with mfe_r ≥ trigger AND mae_to_exit ≤ newStop
 *   • Saved R Bound (upper)  = losersReached × (newStop − (−1))   [+0.25/0.5/0.75/1 per loser]
 *   • Lost R Bound (worst)   = Σ max(0, realised netR − newStop) over threatened winners
 *   • Net Impact Bound       = Saved − Lost
 * Threatened/Lost/Net require mae_r_to_original_exit; absent → bounds unavailable.
 */
export const RISK_REDUCTION_RULES = [
    { trigger: 0.25, newStop: -0.75 },
    { trigger: 0.5, newStop: -0.5 },
    { trigger: 0.75, newStop: -0.25 },
    { trigger: 1.0, newStop: 0 },
];
export function cohortRiskReduction(executedTrades, rules = RISK_REDUCTION_RULES) {
    const rows = Array.isArray(executedTrades) ? executedTrades : [];
    const winnersV = rows.filter((t) => classifyTrade(t) === "WIN" && mfeOf(t) != null);
    const losersV = rows.filter((t) => classifyTrade(t) === "LOSS" && mfeOf(t) != null);
    const boundsAvailable = winnersV.some((t) => maeToExitOf(t) != null);
    const signalOf = (net, threatened, totalW) => {
        if (net == null) return "—";
        const ratio = totalW ? threatened / totalW : 0;
        if (net > 0.5 && ratio <= 0.34) return "Strong";
        if (net < -0.001 || ratio > 0.5) return "Weak";
        return "Mixed";
    };
    const lv = rules.map(({ trigger, newStop }) => {
        const losersReached = losersV.filter((t) => mfeOf(t) >= trigger).length;
        const savedRBound = Number((losersReached * (newStop - -1)).toFixed(2));
        let threatenedWinners = null, lostRBound = null, netImpactBound = null, signal = "—";
        if (boundsAvailable) {
            const threatened = winnersV.filter((t) => mfeOf(t) >= trigger && maeToExitOf(t) != null && maeToExitOf(t) <= newStop);
            threatenedWinners = threatened.length;
            lostRBound = Number(threatened.reduce((s, t) => s + Math.max(0, tradeR(t) - newStop), 0).toFixed(2));
            netImpactBound = Number((savedRBound - lostRBound).toFixed(2));
            signal = signalOf(netImpactBound, threatenedWinners, winnersV.length);
        }
        return { trigger, newStop, losersReached, threatenedWinners, savedRBound, lostRBound, netImpactBound, signal };
    });
    return { totalLosers: losersV.length, totalWinners: winnersV.length, boundsAvailable, levels: lv };
}

/**
 * Phase 3E — simple RULE-BASED management read (NOT AI, NOT prediction, NOT
 * optimization). Composes the existing reach-rate/outcome helpers into a single
 * "what to test next" suggestion. Conservative: a sample under 5 trades forces a
 * "Too little data" bias regardless of other signals. Rules are evaluated in a
 * fixed order (A→B→C→D→fallback); first match wins.
 */
export function cohortManagementRead(executedTrades) {
    const rows = Array.isArray(executedTrades) ? executedTrades : [];
    const count = rows.length;
    const baseCaveats = ["Exploratory MFE-based guidance — confirm with a backend scenario run."];

    let sample;
    if (count === 0) sample = { count, label: "No executed trades", severity: "muted" };
    else if (count < 5) sample = { count, label: "Too little data", severity: "muted" };
    else if (count < 10) sample = { count, label: "Small sample", severity: "warning" };
    else sample = { count, label: "Usable sample", severity: "normal" };

    if (count === 0) {
        return { sample, bias: { key: "none", label: "No executed trades", tone: "neutral", detail: "No executed trades in this cohort." }, nextTests: [], caveats: baseCaveats };
    }
    if (count < 5) {
        return {
            sample,
            bias: { key: "too_little", label: "Too little data", tone: "neutral", detail: "Not enough executed trades to read management signals." },
            nextTests: [{ label: "Collect a larger sample", reason: "Fewer than 5 executed trades", priority: "low" }],
            caveats: [...baseCaveats, "Sample under 5 trades — signals are unreliable."],
        };
    }

    const caveats = [...baseCaveats];
    if (count < 10) caveats.push("Small sample (5–9 trades) — treat as directional only.");

    const netR = rows.reduce((s, t) => s + tradeR(t), 0);
    const dist = cohortOutcomeDistribution(rows);
    const wins = (dist.buckets.find((b) => b.key === "win") || {}).count || 0;
    const losses = (dist.buckets.find((b) => b.key === "loss") || {}).count || 0;
    const winRate = (wins + losses) ? (wins / (wins + losses)) * 100 : null;
    const ts = cohortTargetSuitability(rows);
    const be = cohortBESuitability(rows);
    const tsAt = (lvl) => { const l = ts.levels.find((x) => x.level === lvl); return l ? l.reachedPct : null; };
    const beAt = (lvl) => be.levels.find((x) => x.level === lvl) || {};
    const ge = (p, x) => p != null && p >= x;
    const lt = (p, x) => p != null && p < x;

    const lr05 = beAt(0.5).losersReachedPct;
    const lr1 = beAt(1).losersReachedPct;
    const wr1 = beAt(1).winnersReachedPct;
    const wr2 = beAt(2).winnersReachedPct;
    const tr05 = tsAt(0.5);
    const tr3 = tsAt(3);

    let bias, nextTests;
    if (netR <= 0 && ge(lr05, 50) && ge(tr05, 60)) {
        bias = { key: "fast_target", label: "Fast target candidate", tone: "warning", detail: "Losses often reached 0.5R before failing, while wider targets were less reliable." };
        nextTests = [
            { label: "Test 0.5R target", reason: "Many trades reached 0.5R", priority: "high" },
            { label: "Test 1R target", reason: "Compare against a slightly wider target", priority: "medium" },
            { label: "Test BE at 0.5R", reason: "Protect early-favorable trades", priority: "medium" },
        ];
    } else if (ge(lr1, 50) && ge(wr1, 80)) {
        bias = { key: "be_candidate", label: "BE candidate", tone: "warning", detail: "Most winners cleared 1R and many losers also reached 1R first — BE may protect runners." };
        nextTests = [
            { label: "Test BE at 1R", reason: "Winners clear 1R; losers often touch it", priority: "high" },
            { label: "Test BE at 0.5R", reason: "Compare an earlier BE arm", priority: "medium" },
        ];
    } else if (netR > 0 && ge(tr3, 40) && ge(wr2, 70)) {
        bias = { key: "let_winners_breathe", label: "Let winners breathe", tone: "success", detail: "Winners frequently extended beyond 2R — a wider target may capture more." };
        nextTests = [
            { label: "Test 3R target", reason: "Many winners reached 3R", priority: "high" },
            { label: "Test 5R target", reason: "Probe the upper tail", priority: "medium" },
        ];
    } else if (netR < 0 && lt(winRate, 35) && lt(tr05, 40)) {
        bias = { key: "disable_candidate", label: "Disable candidate", tone: "danger", detail: "Low win rate with weak target reach — this cohort may not be worth trading." };
        nextTests = [
            { label: "Test disabling this cohort", reason: "Negative netR, low win rate, weak reach", priority: "high" },
        ];
    } else {
        bias = { key: "inconclusive", label: "Needs more testing", tone: "neutral", detail: "No strong directional signal from reach-rates yet." };
        nextTests = [
            { label: "Test 1R and 2R targets", reason: "Establish a baseline target sweep", priority: "low" },
        ];
    }
    return { sample, bias, nextTests, caveats };
}

/**
 * Phase 4B — fast rule-based "research verdict" synthesizing the existing reach-
 * rate / outcome / failure helpers into a 10-second read. NOT AI / prediction /
 * optimization — it says what to INVESTIGATE next, not what to trade. Pure.
 */
export function cohortResearchVerdict(executedTrades) {
    const rows = Array.isArray(executedTrades) ? executedTrades : [];
    const count = rows.length;
    const ge = (p, x) => p != null && p >= x;
    const lt = (p, x) => p != null && p < x;
    const caveat = "Exploratory, rule-based research signal — confirm with a backend scenario run.";

    // Sample
    let sample;
    if (count === 0) sample = { count, label: "No data", tone: "neutral" };
    else if (count < 5) sample = { count, label: "Too little data", tone: "danger" };
    else if (count < 10) sample = { count, label: "Small sample", tone: "warning" };
    else sample = { count, label: "Usable sample", tone: "success" };

    const netR = rows.reduce((s, t) => s + tradeR(t), 0);
    const dist = cohortOutcomeDistribution(rows);
    const wins = (dist.buckets.find((b) => b.key === "win") || {}).count || 0;
    const losses = (dist.buckets.find((b) => b.key === "loss") || {}).count || 0;
    const winRate = (wins + losses) ? (wins / (wins + losses)) * 100 : null;

    // Current read
    let currentRead;
    if (count === 0) currentRead = { label: "No data", tone: "neutral", detail: "No executed trades." };
    else if (netR > 0 && ge(winRate, 35)) currentRead = { label: "Positive cohort", tone: "success", detail: "Net positive with a reasonable win rate." };
    else if (netR > 0) currentRead = { label: "Positive but tail-dependent", tone: "warning", detail: "Net positive but win rate is low — results lean on a few large winners." };
    else if (netR <= 0 && count >= 10) currentRead = { label: "Losing cohort", tone: "danger", detail: "Net negative across a usable sample." };
    else currentRead = { label: "Inconclusive", tone: "neutral", detail: "Not enough signal to call yet." };

    // Target read
    const ts = cohortTargetSuitability(rows);
    const tsAt = (lvl) => { const l = ts.levels.find((x) => x.level === lvl); return l ? l.reachedPct : null; };
    let targetRead;
    if (ts.coverage.withMFE === 0) targetRead = { label: "No MFE data", tone: "neutral", detail: "No excursion data to read targets." };
    else if (ge(tsAt(3), 40)) targetRead = { label: "Runner behaviour detected", tone: "success", detail: "Many trades reached 3R before exit." };
    else if (ge(tsAt(0.5), 65) && lt(tsAt(2), 35)) targetRead = { label: "Fast-target candidate", tone: "warning", detail: "Often reached 0.5R but rarely 2R." };
    else targetRead = { label: "No clear target bias", tone: "neutral", detail: "No dominant target-reach pattern." };

    // BE read
    const be = cohortBESuitability(rows);
    const beAt = (lvl) => be.levels.find((x) => x.level === lvl) || {};
    let beRead;
    if (be.totalLosers === 0 && be.totalWinners === 0) beRead = { label: "No MFE data", tone: "neutral", detail: "No excursion data to read BE." };
    else if (beAt(0.5).signal === "Strong" || beAt(1).signal === "Strong") beRead = { label: "BE candidate", tone: "success", detail: "Strong BE reach signal at 0.5R/1R." };
    else if (ge(beAt(1).winnersReachedPct, 80) && lt(beAt(1).losersReachedPct, 35)) beRead = { label: "BE likely harmful", tone: "warning", detail: "Winners clear 1R but losers rarely reach it — BE would mostly cut winners." };
    else beRead = { label: "No clear BE bias", tone: "neutral", detail: "No dominant BE pattern." };

    // Failure read
    const fail = cohortFailureSummary(rows);
    let failureRead;
    if (ge(fail.lossRate, 50)) failureRead = { label: "Loss-heavy", tone: "danger", detail: "Half or more of executed trades lost." };
    else if (fail.totalLosses > 0 && fail.avgLossR != null && fail.avgLossR <= -1) failureRead = { label: "Full-stop losses dominate", tone: "danger", detail: "Average loss is at or beyond full stop." };
    else if (fail.totalLosses === 0 && count > 0) failureRead = { label: "No losses in sample", tone: "success", detail: "No losing trades in this sample." };
    else failureRead = { label: "Mixed failure profile", tone: "neutral", detail: "No dominant failure pattern." };

    // Next test — prefer management read's top suggestion, else a sensible fallback.
    const mr = cohortManagementRead(rows);
    let nextTest = mr.nextTests && mr.nextTests[0] ? mr.nextTests[0] : null;
    if (!nextTest) {
        if (count < 5) nextTest = { label: "Run a wider sample", reason: "Fewer than 5 executed trades", priority: "low" };
        else if (currentRead.label === "Inconclusive") nextTest = { label: "Compare entry models", reason: "No clear directional read", priority: "medium" };
        else if (failureRead.label === "Loss-heavy") nextTest = { label: "Inspect failure rows", reason: "High loss rate", priority: "medium" };
        else nextTest = { label: "Compare entry models", reason: "Establish a baseline", priority: "low" };
    }

    return { sample, currentRead, targetRead, beRead, failureRead, nextTest, caveat };
}

/**
 * Phase 4D — rule-based failure clustering over a cohort's LOSS trades only.
 * Buckets each loss by how far it ran in favour (MFE) before failing, so callers
 * can tell entry-quality losses from give-back losses from deep-runner losses.
 * classifyTrade is the single source of truth for "loss". Pure, no mutation.
 */
const FAILURE_CLUSTER_DEFS = [
    { key: "immediate",  label: "Immediate failure",  read: "Never moved meaningfully in favour", test: (m) => m != null && m <= 0.1 },
    { key: "faded_05",   label: "Faded before 0.5R",  read: "Small run-up, then failed",          test: (m) => m != null && m > 0.1 && m < 0.5 },
    { key: "gaveback_1", label: "Gave back 0.5–1R",   read: "Reached partial profit zone before failing", test: (m) => m != null && m >= 0.5 && m < 1 },
    { key: "gaveback_2", label: "Gave back 1–2R",     read: "Reached meaningful profit before failing",    test: (m) => m != null && m >= 1 && m < 2 },
    { key: "deep",       label: "Deep runner failure", read: "Reached 2R+ but still failed",       test: (m) => m != null && m >= 2 },
    { key: "unknown",    label: "Unknown MFE",        read: "No excursion data",                   test: (m) => m == null },
];
const CLUSTER_FOCUS = {
    immediate: "Entry quality / timing",
    faded_05: "Entry quality / timing",
    gaveback_1: "Fast target or early protection",
    gaveback_2: "BE / partial management candidate",
    deep: "Trailing / exit management candidate",
    unknown: "Need MFE coverage",
};
export function cohortFailureClusters(executedTrades) {
    const rows = Array.isArray(executedTrades) ? executedTrades : [];
    const losses = rows.filter((t) => classifyTrade(t) === "LOSS");
    const totalLosses = losses.length;
    const buckets = FAILURE_CLUSTER_DEFS.map((d) => ({ def: d, trades: [] }));
    for (const t of losses) {
        const m = mfeOf(t);
        const b = buckets.find((x) => x.def.test(m));
        if (b) b.trades.push(t);
    }
    const avg = (arr, f) => { const v = arr.map(f).filter((n) => Number.isFinite(n)); return v.length ? Number((v.reduce((s, n) => s + n, 0) / v.length).toFixed(2)) : null; };
    const clusters = buckets
        .filter((b) => b.trades.length > 0)
        .map((b) => ({
            key: b.def.key,
            label: b.def.label,
            read: b.def.read,
            count: b.trades.length,
            pct: totalLosses ? Number(((b.trades.length / totalLosses) * 100).toFixed(1)) : 0,
            avgMFE: avg(b.trades, mfeOf),
            avgLossR: avg(b.trades, tradeR),
            trades: b.trades,
        }));
    // Dominant = highest count; ties resolve to the earlier (more actionable) bucket
    // since FAILURE_CLUSTER_DEFS is already ordered immediate → deep → unknown.
    let dominantCluster = null;
    for (const c of clusters) { if (!dominantCluster || c.count > dominantCluster.count) dominantCluster = c; }
    const suggestedFocus = dominantCluster ? (CLUSTER_FOCUS[dominantCluster.key] || null) : null;
    return { totalLosses, clusters, dominantCluster, suggestedFocus };
}

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Same timestamp precedence the executed tables render (fillTime → fill_time → entry).
function regimeTs(t) {
    return t?.fillTime ?? t?.fill_time ?? t?.entry ?? t?.entry_time ?? t?.entryTime ?? null;
}
function regimeYearMonth(t) {
    const raw = regimeTs(t);
    if (raw == null) return null;
    const str = String(raw);
    const m = str.match(/(\d{4})-(\d{2})/); // ISO-ish: avoid TZ drift on the date
    if (m) return { year: Number(m[1]), month: Number(m[2]) };
    const d = new Date(str);
    if (Number.isNaN(d.getTime())) return null;
    return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

/**
 * Phase 4C — pure time-regime snapshot over a cohort's EXECUTED trades only.
 * Groups by calendar year (ascending) and by calendar month (Jan→Dec, aggregated
 * across years). Reuses statsFor (classifyTrade single source of truth) so win/
 * loss/BE/netR/avgR/winRate match the rest of Session Results. Rows without a
 * parseable timestamp are skipped. No mutation. Buckets with no trades are omitted.
 */
export function cohortRegimeSnapshot(executedTrades) {
    const rows = Array.isArray(executedTrades) ? executedTrades : [];
    const byYear = new Map();
    const byMonth = new Map();
    for (const t of rows) {
        const ym = regimeYearMonth(t);
        if (!ym) continue;
        if (!byYear.has(ym.year)) byYear.set(ym.year, []);
        byYear.get(ym.year).push(t);
        if (!byMonth.has(ym.month)) byMonth.set(ym.month, []);
        byMonth.get(ym.month).push(t);
    }
    const years = [...byYear.keys()].sort((a, b) => a - b).map((year) => {
        const s = statsFor(byYear.get(year));
        return { year, trades: s.count, wins: s.wins, losses: s.losses, be: s.be, winRate: s.winRate, netR: s.netR, avgR: s.avgR };
    });
    const months = [...byMonth.keys()].sort((a, b) => a - b).map((month) => {
        const s = statsFor(byMonth.get(month));
        return { month, label: MONTH_NAMES[month - 1], trades: s.count, wins: s.wins, losses: s.losses, be: s.be, winRate: s.winRate, netR: s.netR, avgR: s.avgR };
    });
    // Ties resolve to the earliest bucket (arrays are already chronologically sorted).
    const best = (arr) => (arr.length ? arr.reduce((b, x) => (x.netR > b.netR ? x : b)) : null);
    const worst = (arr) => (arr.length ? arr.reduce((b, x) => (x.netR < b.netR ? x : b)) : null);
    return {
        years, months,
        bestYear: best(years), worstYear: worst(years),
        bestMonth: best(months), worstMonth: worst(months),
    };
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
