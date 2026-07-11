// runPortfolioAttribution.js — RUN-SPECIFIC Portfolio Manager attribution (read-only, PURE).
//
// The Portfolio Manager PAGE shows the DEPLOYED policy + frozen full-history research
// evidence (portfolioLabels.js + deployedPolicy.v1.json). THIS helper answers a different
// question: "what did the Portfolio Manager actually DO inside THIS run?" — computed only
// from the imported trade rows of the viewed run + its config. It never reads the research
// dataset, never mutates rows, and reuses buildSessionResults() so the run panel and the
// Session Results tab agree cohort-for-cohort.
//
// Model (faithful to the Lux backend, src/execution.py):
//   • kept       = executed fills (PM allowed them into the portfolio).
//   • blocked    = REGIME_BLOCKED missed rows (PM removed them), split by block reason
//                  (portfolio_disabled | state_not_allowed | direction_mismatch).
//   • The backend writes NO realized R for a blocked row, so a "would-have-been Net R"
//     is genuinely unavailable → reported as { available:false } (never fabricated).
//
// Consumers: the "Portfolio Manager in this run" panel in Run Workspace.

import { buildSessionResults } from "./sessionResults";
import { POLICY_LABELS } from "./portfolioLabels";

const rOf = (t) => {
    const v = Number(t?.netR ?? t?.net_r ?? t?.pnl_r ?? t?.r ?? 0);
    return Number.isFinite(v) ? v : 0;
};
const timeOf = (t) => String(t?.fillTime || t?.fill_time || t?.entry || t?.exit || "");

// Would-have-been R for a PM-blocked candidate — ONLY if the backend emitted one. The
// current Lux artifact does not, so this returns null for every real run today (honest).
function wouldHaveBeenR(t) {
    for (const k of ["would_have_been_r", "wouldHaveBeenR", "r_if_taken", "rIfTaken", "hypothetical_r", "blocked_r"]) {
        const v = t?.[k];
        if (v !== undefined && v !== null && v !== "" && Number.isFinite(Number(v))) return Number(v);
    }
    return null;
}

// Max drawdown (in R, ≤ 0) of a chronologically-ordered kept-trade equity curve.
function maxDrawdownR(keptRows) {
    const ordered = [...keptRows].sort((a, b) => (timeOf(a) < timeOf(b) ? -1 : timeOf(a) > timeOf(b) ? 1 : 0));
    let peak = 0, cum = 0, maxDD = 0;
    for (const t of ordered) {
        cum += rOf(t);
        if (cum > peak) peak = cum;
        const dd = cum - peak;
        if (dd < maxDD) maxDD = dd;
    }
    return ordered.length ? maxDD : null;
}

const round2 = (v) => (v == null ? null : Number(v.toFixed(2)));

/**
 * @param {Array} trades  imported (normalized) trade rows of the viewed run.
 * @param {object} config run config (runData.config) — carries portfolio_policy_* + scenario.
 * @param {object} [opts] { instrument, policyByKey } — deployed-policy fallback for the
 *   per-cohort action (covers NEVER-TRADE cohorts that produced zero rows).
 * @returns run-specific PM attribution model. `enabled:false` ⇒ PM was OFF for this run.
 */
export function buildRunPortfolioAttribution(trades, config, opts = {}) {
    const cfg = config || {};
    const enabled = cfg.portfolio_policy_enabled === true || cfg.portfolio_policy_enabled === "true";
    const version = cfg.portfolio_policy_version || null;
    const mode = cfg.portfolio_policy_mode || null;
    if (!enabled) {
        return { enabled: false, version, mode, cohorts: [], summary: null };
    }

    const instrument = opts.instrument || cfg.symbol || cfg.instrument
        || (Array.isArray(trades) ? (trades.find((t) => t.symbol || t.instrument)?.symbol || trades.find((t) => t.symbol || t.instrument)?.instrument) : "") || "";
    const portfolioCtx = { enabled: true, instrument, version, policyByKey: opts.policyByKey || null };
    const res = buildSessionResults(trades, cfg.session_strategy_scenario || null, portfolioCtx);

    // Flatten the 6×4 grid to a cohort list, keeping the session it belongs to.
    const cohorts = [];
    let anyWouldBe = false;
    for (const s of res.sessions) {
        for (const c of s.cohorts) {
            // Per-cohort would-have-been Net R, summed DIRECTLY from this cohort's blocked
            // rows (only non-null when the backend emitted a hypothetical R — usually none).
            let cohortWouldBe = null;
            for (const t of c.portfolioBlockedOpportunities) {
                const wb = wouldHaveBeenR(t);
                if (wb != null) { cohortWouldBe = (cohortWouldBe || 0) + wb; anyWouldBe = true; }
            }
            cohorts.push({
                session: s.key,
                sessionLabel: s.label,
                cell: c.key,
                label: c.label,
                structure: c.structure,
                direction: c.direction,
                pmAction: c.pmAction,
                pmActionLabel: c.pmActionLabel || (c.pmAction ? POLICY_LABELS[c.pmAction] : null),
                pmActionSource: c.pmActionSource,
                state: c.display ? c.display.state : "enabled",
                statusLabel: c.display ? c.display.label : "Enabled",
                tone: c.display ? c.display.tone : "ok",
                keptCount: c.executedCount,
                blockedCount: c.portfolioBlockedCount,
                missedCount: c.cancelledMissedCount,
                scenarioDisabledCount: c.disabledCount,
                wins: c.summary ? c.summary.wins : 0,
                losses: c.summary ? c.summary.losses : 0,
                be: c.summary ? c.summary.be : 0,
                netRKept: c.summary ? c.summary.netR : 0,
                winRateKept: c.summary ? c.summary.winRate : null,
                pfKept: c.summary ? c.summary.pf : null,
                blockedWouldBeNetR: cohortWouldBe == null ? null : round2(cohortWouldBe),
            });
        }
    }

    const keptRows = res.sessions.flatMap((s) => s.cohorts.flatMap((c) => c.executedTrades));
    const blockedRows = res.sessions.flatMap((s) => s.cohorts.flatMap((c) => c.portfolioBlockedOpportunities));

    // Kept-book metrics (the "after PM" portfolio). Win/Loss/BE + Net R are SUMMED from the
    // per-cohort summaries (classifyTrade-based) so the panel agrees exactly with the cohort
    // table and Session Results; gross win/loss (for PF) + Max DD come from the kept rows.
    let wins = 0, losses = 0, be = 0, netRKept = 0;
    for (const c of cohorts) { wins += c.wins; losses += c.losses; be += c.be; netRKept += c.netRKept; }
    let grossWin = 0, grossLoss = 0;
    for (const t of keptRows) {
        const r = rOf(t);
        if (r > 0) grossWin += r;
        else if (r < 0) grossLoss += -r;
    }
    const decided = wins + losses;
    const winRate = decided ? Math.round((wins / decided) * 1000) / 10 : null;
    const pf = grossLoss > 0 ? Math.round((grossWin / grossLoss) * 100) / 100 : (grossWin > 0 ? null : null); // null ⇒ ∞/n-a at UI
    const pfInfinite = grossLoss === 0 && grossWin > 0;
    const maxDD = maxDrawdownR(keptRows);

    // Blocked-book: split by block reason (available) + would-have-been R (usually NOT).
    const blockReasonCounts = { portfolio_disabled: 0, state_not_allowed: 0, direction_mismatch: 0, other: 0 };
    let blockedWouldBeNetR = 0;
    for (const t of blockedRows) {
        const reason = String(t.regime_block_reason || t.regimeBlockReason || t.portfolio_block_reason || "").toLowerCase().replace(/[^a-z_]+/g, "_");
        if (reason in blockReasonCounts) blockReasonCounts[reason]++; else blockReasonCounts.other++;
        const wb = wouldHaveBeenR(t);
        if (wb != null) blockedWouldBeNetR += wb;
    }
    const wouldBeAvailable = anyWouldBe;

    // Cohort roll-ups (run-level).
    const cohortsActive = cohorts.filter((c) => c.state === "active").length;
    const cohortsBlocked = cohorts.filter((c) => c.state === "pm_blocked").length;
    const cohortsPmDisabled = cohorts.filter((c) => c.state === "pm_disabled").length;
    const cohortsNoSetup = cohorts.filter((c) => c.state === "enabled_no_setups").length;
    const cohortsNoFill = cohorts.filter((c) => c.state === "enabled_no_fills").length;
    const cohortsScenarioDisabled = cohorts.filter((c) => c.state === "scenario_disabled").length;

    return {
        enabled: true,
        version,
        mode,
        instrument,
        summary: {
            keptCount: keptRows.length,
            blockedCount: blockedRows.length,
            keptWins: wins,
            keptLosses: losses,
            keptBe: be,
            netRKept: round2(netRKept),
            winRateKept: winRate,
            pfKept: pf,
            pfKeptInfinite: pfInfinite,
            maxDrawdownRKept: round2(maxDD),
            blockReasonCounts,
            // The blocked book has no realized outcome in the run data → honest flags.
            blockedWouldBeAvailable: wouldBeAvailable,
            blockedWouldBeNetR: wouldBeAvailable ? round2(blockedWouldBeNetR) : null,
            // "before PM" (control) = kept + would-have-been; only computable if the latter exists.
            netEffectAvailable: wouldBeAvailable,
            controlNetR: wouldBeAvailable ? round2(netRKept + blockedWouldBeNetR) : null,
            cohortsActive,
            cohortsBlocked,
            cohortsPmDisabled,
            cohortsNoSetup,
            cohortsNoFill,
            cohortsScenarioDisabled,
        },
        cohorts,
    };
}

export const _internals = { rOf, wouldHaveBeenR, maxDrawdownR };
