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
function normLevels(arr) {
    return (Array.isArray(arr) ? arr : [])
        .map(Number)
        .filter((n) => Number.isFinite(n) && n > 0);
}
/**
 * Resolve the SINGLE effective "Arm Level Reached" from filters.
 *   • filters.armLevel (number > 0)  → that level (preferred, single-select).
 *   • filters.armLevels (array)      → backward compat: normalized to its LOWEST
 *     value, which preserves the previous OR semantics (a trade matched if it
 *     reached AT LEAST the lowest selected level). Reaching a higher level
 *     implies the lower, so the lowest is the binding constraint.
 *   • neither                        → null (no arm constraint).
 */
function effectiveArmLevel(filters = {}) {
    const single = num(filters.armLevel);
    if (single != null && single > 0) return single;
    const arr = normLevels(filters.armLevels);
    return arr.length ? Math.min(...arr) : null;
}
/**
 * Max favorable excursion (R) the ORIGINAL trade reached before reversing —
 * stop-anchored `mfe_r`. This is the cohort source for "Arm Level Reached":
 * it answers "how far did this trade move into profit", independent of the BE
 * scenario. Null when absent (e.g. unfilled rows) → never matches an arm level.
 */
function tradeMfeR(t) {
    return num(t?.mfe_r) ?? num(t?.mfeR);
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

// Flat/breakeven tolerance for R comparisons (matches tradeClassification).
const ATTR_FLAT_EPS = 0.005;
const ATTR_DELTA_EPS = 1e-9;
const ATTR_LABELS = {
    loss_saved: "Loss Saved",
    winner_cut: "Winner Cut",
    tp_kept: "TP Kept",
    news_flat: "News Flat",
    same_loss: "Same Loss",
    same_breakeven: "Same Breakeven",
    other_same: "Other Same",
    other_changed: "Other Changed",
};

function attrOutcomeNorm(v) {
    return String(v ?? "").trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_");
}
/** News-flatten detection from a trade's outcome / news_action. Self-contained. */
function attrIsNewsFlat(t) {
    if (!t) return false;
    const o = attrOutcomeNorm(t.outcome ?? t.result);
    if (o.includes("NEWS_FLATTEN")) return true;
    const a = attrOutcomeNorm(t.news_action ?? t.newsAction);
    return a === "FLATTENED_ACTIVE_TRADE" || a.includes("NEWS_FLATTEN");
}

/**
 * Explicit lifecycle classification for a BE-applied trade (PURE). Replaces the
 * ambiguous "affected / no change" language with a definite bucket. The economic
 * R math is unchanged — this only labels what happened.
 *
 * @returns {{ category, label, deltaR, originalR, protectedR }}
 */
export function classifyBeAttributionRow({ originalTrade, protectedTrade } = {}) {
    const origR = tradeR(originalTrade);
    const protR = tradeR(protectedTrade);
    const deltaR = protR - origR;
    let category;
    if (deltaR > ATTR_DELTA_EPS && origR < 0) category = "loss_saved";
    else if (deltaR < -ATTR_DELTA_EPS && origR > 0) category = "winner_cut";
    else if (Math.abs(deltaR) <= ATTR_DELTA_EPS) {
        if (attrIsNewsFlat(protectedTrade) || attrIsNewsFlat(originalTrade)) category = "news_flat";
        else if (origR > ATTR_FLAT_EPS && protR > ATTR_FLAT_EPS) category = "tp_kept";
        else if (origR < -ATTR_FLAT_EPS && protR < -ATTR_FLAT_EPS) category = "same_loss";
        else if (Math.abs(origR) <= ATTR_FLAT_EPS && Math.abs(protR) <= ATTR_FLAT_EPS) category = "same_breakeven";
        else category = "other_same";
    } else {
        category = "other_changed"; // Δ ≠ 0 but not a clean save/cut.
    }
    return { category, label: ATTR_LABELS[category], deltaR: rnd(deltaR), originalR: rnd(origR), protectedR: rnd(protR) };
}

/**
 * Per-session attribution over a built selective universe's trades. Counts only
 * protectionApplied (BE-swapped) rows by explicit lifecycle category (see
 * classifyBeAttributionRow). Totals reconcile with the universe summary:
 * totals.applied === applied, totals.deltaR === summary.deltaNetR (2dp).
 * `same` = sameLoss + sameBreakeven + otherSame (display bucket); the detailed
 * counts are retained for debugging. Pure.
 *
 * @param {object[]} universeTrades  the `.trades` of a buildSelectiveBeUniverse result
 */
export function buildSessionAttribution(universeTrades) {
    const list = Array.isArray(universeTrades) ? universeTrades : [];
    const bySession = new Map();
    const mk = (session) => ({
        session, applied: 0, saved: 0, cut: 0, tpKept: 0, newsFlat: 0,
        sameLoss: 0, sameBreakeven: 0, otherSame: 0, otherChanged: 0, deltaR: 0,
    });
    const totals = mk(undefined); delete totals.session;
    const CAT_TO_KEY = {
        loss_saved: "saved", winner_cut: "cut", tp_kept: "tpKept", news_flat: "newsFlat",
        same_loss: "sameLoss", same_breakeven: "sameBreakeven", other_same: "otherSame", other_changed: "otherChanged",
    };
    for (const t of list) {
        if (!t || t.protectionApplied !== true) continue;
        const session = String(t.session ?? t.fillSession ?? t.fill_session ?? "").trim() || "—";
        if (!bySession.has(session)) bySession.set(session, mk(session));
        const row = bySession.get(session);
        row.applied += 1; totals.applied += 1;
        // Prefer the category stamped at build time; fall back to recomputing.
        const category = t.beCategory
            || classifyBeAttributionRow({ originalTrade: { net_r: t.originalR }, protectedTrade: t }).category;
        const key = CAT_TO_KEY[category] || "otherSame";
        row[key] += 1; totals[key] += 1;
        const d = num(t.deltaR) ?? 0;
        row.deltaR += d; totals.deltaR += d;
    }
    const withSame = (r) => ({ ...r, same: r.sameLoss + r.sameBreakeven + r.otherSame, deltaR: rnd(r.deltaR) });
    const rows = [...bySession.values()].map(withSame).sort((a, b) => a.session.localeCompare(b.session));
    const totalsOut = withSame(totals);
    // Back-compat alias: callers that read `affected` still work.
    totalsOut.affected = totalsOut.applied;
    rows.forEach((r) => { r.affected = r.applied; });
    return { rows, totals: totalsOut };
}

/**
 * Cohort match (UX-REMODEL semantics):
 *   • No chips selected ANYWHERE = BE applied to NO trades → always false.
 *   • Otherwise: within a group = OR; across groups = AND; an empty group is
 *     unrestricted ONLY because at least one other group has a selection.
 *
 * Examples (with ≥1 selection somewhere):
 *   Asia            → session == asia
 *   Asia + London   → session ∈ {asia, london}
 *   Long + Asia     → direction == long AND session == asia
 *   CHoCH + NY      → structure == choch AND session == new york
 */
export function matchesCohort(trade, filters = {}) {
    const dirs = normList(filters.directions);
    const structs = normList(filters.structures);
    const sessions = normList(filters.sessions);
    const arm = effectiveArmLevel(filters);

    // Nothing selected anywhere → apply BE to no trades.
    if (!dirs.length && !structs.length && !sessions.length && arm == null) return false;

    if (dirs.length && !dirs.includes(normDirection(trade))) return false;
    if (structs.length && !structs.includes(normStructure(trade))) return false;
    if (sessions.length && !sessions.includes(normSession(trade))) return false;

    // Arm Level Reached (single): the ORIGINAL trade's MFE must reach the selected
    // level. Not tied to the BE scenario (e.g. apply 0.5R BE only to trades that
    // reached 1R). Null MFE (unfilled rows) never matches an arm constraint.
    if (arm != null) {
        const mfe = tradeMfeR(trade);
        if (mfe == null) return false;
        if (mfe < arm - 1e-9) return false;
    }
    return true;
}

/** Human label for the active filter selection, e.g. "CHoCH + New York + 2R" or "None". */
export function selectedFilterLabel(filters = {}) {
    const friendly = { choch: "CHoCH", bos: "BOS", long: "Long", short: "Short" };
    const cat = [
        ...normList(filters.directions),
        ...normList(filters.structures),
        ...normList(filters.sessions),
    ].map((p) => friendly[p] || p.replace(/\b\w/g, (c) => c.toUpperCase()));
    const arm = effectiveArmLevel(filters);
    const lvl = arm != null ? [`${arm}R`] : [];
    const parts = [...cat, ...lvl];
    return parts.length ? parts.join(" + ") : "None";
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
export function buildSelectiveBeUniverse({ originalTrades, beTrades, filters = {}, scenario = {}, applyToAll = false } = {}) {
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

        const be = beById.get(stableTradeId(orig)) || null;
        // applyToAll = "All Trades" protection view: every trade is in-cohort,
        // independent of filters (used by the protection-layer adapter's "all"
        // mode). Default false ⇒ the panel's selective semantics are unchanged.
        const isMatch = applyToAll ? true : matchesCohort(orig, filters);
        if (isMatch) { matched += 1; filteredOriginalTrades.push(orig); }

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
                // Cohort dimensions are a property of the SETUP, not the BE sim —
                // carry them from the original so per-session/direction/structure
                // attribution is correct even if the backend BE CSV omits them.
                session: be.session ?? orig.session ?? orig.fillSession ?? orig.fill_session,
                direction: be.direction ?? orig.direction,
                structure: be.structure ?? orig.structure ?? orig.structure_type,
                protectionApplied: true,
                protectionType: "break_even",
                protectionScenarioKey: scenarioKey,
                // Explicit lifecycle bucket for attribution (pure; no R impact).
                beCategory: classifyBeAttributionRow({ originalTrade: orig, protectedTrade: be }).category,
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

    const fdirs = normList(filters.directions);
    const fstructs = normList(filters.structures);
    const fsessions = normList(filters.sessions);
    const farm = effectiveArmLevel(filters);
    const isNoFilterSelected = !fdirs.length && !fstructs.length && !fsessions.length && farm == null;

    return {
        trades: out,                          // full run with BE applied to the cohort
        filteredOriginalTrades,               // cohort only, before BE
        filteredProtectedTrades,              // cohort only, with BE where available
        applied,
        matched,
        skippedMissingBe,
        isNoFilterSelected,
        selectedFilterLabel: selectedFilterLabel(filters),
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
                // Single effective arm level (preferred). armLevels kept (normalized
                // to the one effective value) for any legacy consumer still reading it.
                armLevel: farm,
                armLevels: farm != null ? [farm] : [],
            },
            lowSampleThreshold: LOW_SAMPLE_THRESHOLD,
            total: originals.length,
            fullBreakdown: cohortBreakdown(originals),
            filteredBreakdown: cohortBreakdown(filteredOriginalTrades),
        },
    };
}
