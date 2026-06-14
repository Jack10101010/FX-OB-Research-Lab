/**
 * clusterPrioritisation.js — Research-triage layer over REJECTED cluster candidates
 * (CLUSTER-2B). Pure, React-free, node-testable.
 *
 * This is NOT a findings engine and NOT a recommendation engine. It re-orders and
 * annotates cohorts the statistical engine ALREADY rejected, to answer one question:
 * "what should I look at next?" It changes no statistical validity — it reads the
 * near-miss stats the page reconstructed and produces a presentation score + labels.
 * Cross-run replication (Hypothesis Lab) remains the only arbiter of truth.
 *
 * Design contract:
 *   - No trade access, no statistics, no gates/thresholds/FDR/shrinkage/survivor logic.
 *   - The opportunity score is a HEURISTIC, never a probability. Labels must never
 *     imply validation (no "validated/proven/significant/likely").
 *   - RECURRENCE IS EXCLUDED FROM THE SCORE (per CLUSTER-2B decision): nested cohorts
 *     share trades, so recurrence is artifact-prone. It is surfaced ONLY as "Recurring
 *     Themes" (a curiosity prompt) and never influences a per-row score.
 *
 * Input: nearMisses[] — each { predicate:[{dim,label,value}], label, parent, n, rate,
 *        lift, confidence, stability, reason } (reconstructed by the page, read-only).
 * Output: { scored[], themes[] }.
 */

// Score weights (presentation constants; recurrence intentionally absent).
export const SCORE_WEIGHTS = { lift: 0.35, sample: 0.30, confidence: 0.20, stability: 0.15 };
export const SAMPLE_K = 40;          // saturating constant (mirrors researchSignals.sampleK)
export const DEFAULT_LIFT_MIN = 1.5; // closeness is measured against the engine's effect gate
export const INTEREST_HIGH = 0.62;
export const INTEREST_INVESTIGATE = 0.40;
export const THEME_MIN_COUNT = 2;    // a factor must appear ≥ twice to be a "theme"
export const DEFAULT_TOP_N = 10;

const CONF_WEIGHT = { "Very Low": 0, Low: 0.4, Medium: 0.7, High: 1.0 };
const STAB_WEIGHT = { stable: 1, stable_under: 1, one_half_only: 0.5, unstable: 0 };

// Interest labels — triage only, never validation. (Emoji is presentation; the page
// may render its own icon, but the wording here must stay overclaim-free.)
export const INTEREST_LABELS = {
    high:        { key: "high",        label: "High Interest",      emoji: "🔥" },
    investigate: { key: "investigate", label: "Worth Investigating", emoji: "👀" },
    weak:        { key: "weak",        label: "Weak Signal",        emoji: "📌" },
};
// Theme frequency descriptors — how often a factor appears, NOT how true it is.
export const THEME_STATUS = {
    frequent:   "frequent",
    recurring:  "recurring",
    occasional: "occasional",
};

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const round2 = (v) => Math.round(Number(v) * 100) / 100;
const round3 = (v) => Math.round(Number(v) * 1000) / 1000;

// How close a rejected cohort came to clearing the effect gate (lift 1.0→0, liftMin→1).
function liftCloseness(lift, liftMin) {
    const l = num(lift) ?? 0;
    const denom = (liftMin || DEFAULT_LIFT_MIN) - 1;
    return denom > 0 ? clamp01((l - 1) / denom) : 0;
}

function scoreOne(nm, liftMin) {
    const lc = liftCloseness(nm.lift, liftMin);
    const n = num(nm.n) ?? 0;
    const ss = n > 0 ? n / (n + SAMPLE_K) : 0;
    const cs = CONF_WEIGHT[nm.confidence] ?? 0;
    const sb = STAB_WEIGHT[nm.stability] ?? 0;
    const score = clamp01(
        SCORE_WEIGHTS.lift * lc +
        SCORE_WEIGHTS.sample * ss +
        SCORE_WEIGHTS.confidence * cs +
        SCORE_WEIGHTS.stability * sb,
    );
    const interest = score >= INTEREST_HIGH ? "high" : score >= INTEREST_INVESTIGATE ? "investigate" : "weak";
    return {
        ...nm,
        opportunityScore: round3(score),
        interest,
        interestLabel: INTEREST_LABELS[interest].label,
        scoreParts: { lift: round2(lc), sample: round2(ss), confidence: round2(cs), stability: round2(sb) },
    };
}

// Recurring Themes — pure aggregation over the predicates of the TOP-N scored cohorts.
// Curiosity prompt ONLY: a factor recurs partly because the search expands promising
// parents (nested, trade-sharing cohorts), so this is NOT independent corroboration.
function buildThemes(top, topN) {
    const map = new Map();
    for (const nm of top) {
        for (const f of nm.predicate || []) {
            const k = `${f.dim}=${f.value}`;
            let e = map.get(k);
            if (!e) { e = { key: k, dim: f.dim, dimLabel: f.label, factor: f.value, count: 0, liftSum: 0, nSum: 0 }; map.set(k, e); }
            e.count += 1;
            e.liftSum += num(nm.lift) ?? 0;
            e.nSum += num(nm.n) ?? 0;
        }
    }
    const denom = top.length || 1;
    return [...map.values()]
        .filter((e) => e.count >= THEME_MIN_COUNT)
        .map((e) => {
            const frequency = e.count / denom;
            const status = frequency >= 0.5 ? "frequent" : frequency >= 0.3 ? "recurring" : "occasional";
            return {
                factor: e.factor, dim: e.dim, dimLabel: e.dimLabel,
                count: e.count, total: denom,
                avgLift: round2(e.liftSum / e.count), avgN: Math.round(e.nSum / e.count),
                frequency: round2(frequency), status,
            };
        })
        .sort((a, b) => (b.count - a.count) || (b.avgLift - a.avgLift));
}

/**
 * scoreNearMisses(nearMisses, options) → { scored, themes }
 * Pure triage ranking. `scored` is sorted by opportunityScore desc; `themes` is the
 * recurrence rollup over the top-N (curiosity only — never feeds the score).
 */
export function scoreNearMisses(nearMisses = [], { liftMin = DEFAULT_LIFT_MIN, topN = DEFAULT_TOP_N } = {}) {
    const list = Array.isArray(nearMisses) ? nearMisses : [];
    const scored = list.map((nm) => scoreOne(nm, liftMin)).sort((a, b) => b.opportunityScore - a.opportunityScore);
    const themes = buildThemes(scored.slice(0, topN), topN);
    return { scored, themes };
}

export default scoreNearMisses;
