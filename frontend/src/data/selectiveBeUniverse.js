// selectiveBeUniverse.js — pure derived "mixed protection" universe.
//
// BE-SELECTIVE-APPLICATION P1. Builds a trade list where trades matching the
// enabled cohort filters use the BE scenario result and all others keep their
// original no-BE result. Pure, no React, no imports — self-contained so the
// validation harness can run it directly.
//
// Integrity: the caller MUST pass beTrades from the SAME variant + EXACT scenario
// as originalTrades (resolved via resolveBeScenarioSource for the current view).
// This module never fetches, never mutates inputs, and never duplicates trades.

const LOW_SAMPLE_THRESHOLD = 10;

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
/** Realized R for a trade row. */
function tradeR(t) {
    return num(t?.net_r) ?? num(t?.netR) ?? num(t?.r) ?? num(t?.pnl_r) ?? 0;
}

/** Stable trade id used for pairing (matches pairBaselineTrade's key order). */
export function stableTradeId(t) {
    return String(
        t?.base_trade_id ?? t?.baseTradeId
        ?? t?.trade_id ?? t?.rawTradeId
        ?? t?.id ?? "",
    ).trim();
}

function normDirection(t) {
    const s = String(t?.direction ?? t?.side ?? "").trim().toLowerCase();
    if (s.startsWith("long") || s.startsWith("bull") || s === "buy") return "long";
    if (s.startsWith("short") || s.startsWith("bear") || s === "sell") return "short";
    return s;
}
function normStructure(t) {
    const s = String(t?.structure ?? t?.structure_type ?? "").trim().toLowerCase();
    if (s.includes("choch")) return "choch";
    if (s.includes("bos")) return "bos";
    return s;
}
function normSession(t) {
    return String(t?.session ?? t?.fillSession ?? t?.fill_session ?? "").trim().toLowerCase();
}
function normList(arr) {
    return (Array.isArray(arr) ? arr : [])
        .map((v) => String(v).trim().toLowerCase())
        .filter(Boolean);
}

/**
 * Structural composition of a trade list (pure; for the panel's count chips).
 * Returns total + long/short + CHoCH/BOS + per-session counts. Wins/losses come
 * from summarizeTradeSanity in the UI (canonical KPI), so they're not duplicated here.
 */
export function cohortBreakdown(trades) {
    const list = Array.isArray(trades) ? trades : [];
    const sessions = {};
    let longs = 0, shorts = 0, choch = 0, bos = 0;
    for (const t of list) {
        const d = normDirection(t);
        if (d === "long") longs += 1; else if (d === "short") shorts += 1;
        const s = normStructure(t);
        if (s === "choch") choch += 1; else if (s === "bos") bos += 1;
        const sess = String(t?.session ?? t?.fillSession ?? t?.fill_session ?? "").trim() || "—";
        sessions[sess] = (sessions[sess] || 0) + 1;
    }
    return { total: list.length, longs, shorts, choch, bos, sessions };
}

/**
 * Cohort match: empty array in a dimension = "all" for that dimension; values
 * within a dimension are OR'd; dimensions combine as AND.
 */
export function matchesCohort(trade, filters = {}) {
    const dirs = normList(filters.directions);
    const structs = normList(filters.structures);
    const sessions = normList(filters.sessions);

    if (dirs.length && !dirs.includes(normDirection(trade))) return false;
    if (structs.length && !structs.includes(normStructure(trade))) return false;
    if (sessions.length && !sessions.includes(normSession(trade))) return false;
    return true;
}

/**
 * Build the selective (mixed) BE universe.
 *
 * @returns {{
 *   trades: object[],          // mixed list; BE row where matched+available, else original
 *   applied: number,           // trades using the BE result
 *   matched: number,           // trades matching the cohort filters (regardless of BE availability)
 *   skippedMissingBe: number,  // matched trades with no paired BE row (kept original)
 *   summary: object,
 *   warnings: string[],
 *   meta: object,
 * }}
 */
export function buildSelectiveBeUniverse({ originalTrades, beTrades, filters = {}, scenario = {} } = {}) {
    const originals = Array.isArray(originalTrades) ? originalTrades : [];
    const beList = Array.isArray(beTrades) ? beTrades : [];
    const warnings = [];

    // Index BE trades by stable id (last one wins; ids are unique per scenario pass).
    const beById = new Map();
    for (const be of beList) {
        const id = stableTradeId(be);
        if (id) beById.set(id, be);
    }

    const scenarioKey = scenario.beScenarioKey ?? scenario.scenarioKey ?? null;
    const out = [];
    // Cohort-only sets: the filtered trades before BE (original) and the same
    // filtered trades with BE applied where available. Used by the panel's
    // "Original Filtered Cohort" and "Selected Cohort With BE" cards.
    const filteredOriginalTrades = [];
    const filteredProtectedTrades = [];
    let applied = 0;
    let matched = 0;
    let skippedMissingBe = 0;
    let lossesSaved = 0;
    let winnersCut = 0;
    let beExits = 0;
    let originalNetR = 0;
    let protectedNetR = 0;

    for (const orig of originals) {
        const origR = tradeR(orig);
        originalNetR += origR;

        const isMatch = matchesCohort(orig, filters);
        if (isMatch) { matched += 1; filteredOriginalTrades.push(orig); }

        const be = isMatch ? beById.get(stableTradeId(orig)) : null;

        if (isMatch && be) {
            const protR = tradeR(be);
            protectedNetR += protR;
            applied += 1;
            const reason = String(be.be_exit_reason ?? be.beExitReason ?? "").toLowerCase();
            const triggered = bool(be.be_triggered ?? be.beTriggered) || reason === "be_stop";
            if (triggered) {
                beExits += 1;
                if (origR < 0) lossesSaved += 1;
                else if (origR > 0) winnersCut += 1;
            }
            const protectedRow = {
                ...be,
                protectionApplied: true,
                protectionType: "break_even",
                protectionScenarioKey: scenarioKey,
                originalR: rnd(origR),
                protectedR: rnd(protR),
                deltaR: rnd(protR - origR),
            };
            out.push(protectedRow);
            filteredProtectedTrades.push(protectedRow);
        } else {
            // Matched-but-no-BE rows still belong to the cohort: keep the original
            // in the protected cohort set so totals reconcile with the filter.
            if (isMatch && !be) filteredProtectedTrades.push(orig);
            if (isMatch && !be) {
                skippedMissingBe += 1;
            }
            protectedNetR += origR;
            out.push({
                ...orig,
                protectionApplied: false,
                protectionType: null,
                protectionScenarioKey: null,
                originalR: rnd(origR),
                protectedR: rnd(origR),
                deltaR: 0,
            });
        }
    }

    if (skippedMissingBe > 0) warnings.push("unmatched_be");
    const lowSample = matched > 0 && matched < LOW_SAMPLE_THRESHOLD;
    if (lowSample) warnings.push("low_sample");
    if (matched === 0) warnings.push("no_cohort_match");

    return {
        trades: out,                          // full run with BE applied to the cohort
        filteredOriginalTrades,               // cohort only, before BE
        filteredProtectedTrades,              // cohort only, with BE where available
        applied,
        matched,
        skippedMissingBe,
        summary: {
            originalNetR: rnd(originalNetR),
            protectedNetR: rnd(protectedNetR),
            deltaNetR: rnd(protectedNetR - originalNetR),
            lossesSaved,
            winnersCut,
            beExits,
            affected: applied,
            sampleSize: matched,
            lowSample,
        },
        warnings,
        meta: {
            scenarioKey,
            filters: {
                directions: normList(filters.directions),
                structures: normList(filters.structures),
                sessions: normList(filters.sessions),
            },
            lowSampleThreshold: LOW_SAMPLE_THRESHOLD,
            total: originals.length,
            fullBreakdown: cohortBreakdown(originals),
            filteredBreakdown: cohortBreakdown(filteredOriginalTrades),
        },
    };
}
