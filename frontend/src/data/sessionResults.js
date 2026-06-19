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

// Excursion field getters (R units). null when absent (old bundles).
const mfeOf = (t) => { const n = Number(t?.mfeR ?? t?.mfe_r); return Number.isFinite(n) ? n : null; };
const maeOf = (t) => { const n = Number(t?.maeR ?? t?.mae_r); return Number.isFinite(n) ? n : null; };
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
export function cohortTargetSuitability(executedTrades, levels = [0.5, 1, 1.5, 2, 3, 5]) {
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
    const lv = levels.map((level) => {
        const lc = reachedIn(losersV, level);
        const wc = reachedIn(winnersV, level);
        const lp = pct(lc, losersV.length);
        const wp = pct(wc, winnersV.length);
        const netBenefitScore = (lp == null || wp == null) ? null : Number((lp - (100 - wp)).toFixed(1));
        return {
            level,
            losersReachedCount: lc, losersReachedPct: lp,
            winnersReachedCount: wc, winnersReachedPct: wp,
            netBenefitScore,
            signal: signalOf(lp, wp),
        };
    });
    return { totalLosers: losersV.length, totalWinners: winnersV.length, levels: lv };
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
