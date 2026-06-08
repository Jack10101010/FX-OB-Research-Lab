/**
 * researchGlossary.js
 *
 * Canonical SEMANTIC source of truth for research terminology surfaced in the
 * Classification / fill-state UI (badges, tables, filters, insight cards, tooltips).
 *
 * Separation of concerns:
 *   - researchGlossary.js     → MEANING: friendlyName + definition + whyItMatters.
 *   - classificationRegistry  → PRESENTATION: tone + short label + flags.
 *   - tradeClassificationDims  → LOGIC: deriveFillState / buildTradeClassification.
 *
 * This module is data-only: no derivation, no React, no store imports. Adding it
 * is purely additive — no existing consumer reads from it yet (wiring happens in a
 * later, separately-approved step).
 *
 * Each entry:
 *   {
 *     term:           short token shown in dense UI (e.g. "AAE", "WR")
 *     friendlyName:   human-readable name (e.g. "Armed After OB Exit")
 *     definition:     plain-language tooltip body
 *     whyItMatters:   one line on why the term is decision-relevant
 *     interpretation?: OPTIONAL string[] — short "how to read it" lines for advanced
 *                     metrics (thresholds / bands). Rendered as the card's
 *                     Interpretation section; omit for simple terms.
 *   }
 *
 * NOTE on "Clean": it is intentionally NOT a key. The textbook fill is
 *   `occupied_at_arm`; "clean fill" appears only as a synonym inside that entry's
 *   copy. This is deliberate — "clean" historically conflated Occupied-At-Arm with
 *   uninstrumented/Unknown trades, which the fill-state taxonomy separates.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Glossary — keyed by canonical term key.
// ─────────────────────────────────────────────────────────────────────────────

export const GLOSSARY = {
    // ── Fill state at arm (canonical hierarchy) ──────────────────────────────
    occupied_at_arm: {
        term: "Occupied",
        friendlyName: "Occupied At Arm",
        definition:
            "Price was still inside the order block range at the moment the limit order armed. " +
            "This is the textbook / \"clean\" fill.",
        whyItMatters:
            "Weakest cohort (~+0.08R avg). Being still in the block at arm time is not the edge — " +
            "it is the baseline the stronger states are measured against.",
    },
    vacant_at_arm: {
        term: "Vacant",
        friendlyName: "OB Vacant At Arm",
        definition:
            "Price had already left the order block range when the order armed. This is the parent " +
            "state — the superset of AAE and Vacant-No-AAE.",
        whyItMatters:
            "The strongest fill-state signal (~+0.89R avg). Vacancy at arm — not AAE alone — is the " +
            "primary edge.",
    },
    aae: {
        term: "AAE",
        friendlyName: "Armed After OB Exit",
        definition:
            "Price exited the order block through the entry side during the delay window, then " +
            "returned and filled after the limit armed. A high-conviction subtype of OB Vacant.",
        whyItMatters:
            "~+0.59R avg vs ~+0.08R for occupied fills. 100% of AAE fills occur within 4 minutes of " +
            "OB exit — leaving and returning is a strength signal, not a bug.",
    },
    vacant_no_aae: {
        term: "Vacant — No AAE",
        friendlyName: "Vacant, non-AAE",
        definition:
            "The order block was vacant at arm but the fill was not flagged AAE (e.g. vacant from " +
            "origin, or no clean exit-and-return through the entry side).",
        whyItMatters:
            "Isolates the rest of the OB-Vacant cohort so AAE's specific contribution to the +0.89R " +
            "parent edge is visible.",
    },
    unknown_at_arm: {
        term: "Unknown",
        friendlyName: "Unknown At Arm",
        definition:
            "OB occupancy at arm could not be determined (baseline / non-TE trades, or runs that " +
            "predate AAE instrumentation, where obOccupiedAtArm is null).",
        whyItMatters:
            "Must be excluded from fill-state edge analysis — it is NOT \"clean\". Folding it into a " +
            "clean bucket would dilute the occupied-vs-vacant comparison.",
    },

    // ── Statistics ───────────────────────────────────────────────────────────
    stat_n: {
        term: "n",
        friendlyName: "Trade Count",
        definition: "Number of performance trades in the group.",
        whyItMatters:
            "Small n (roughly < 5–10) makes win rate and average R unreliable; always read it " +
            "alongside the rates.",
    },
    stat_wr: {
        term: "WR",
        friendlyName: "Win Rate",
        definition: "Wins ÷ (wins + losses). Breakevens are excluded from the denominator.",
        whyItMatters:
            "Shows hit-rate without breakeven dilution; pair with Avg R, since a high win rate can " +
            "still carry low expectancy.",
    },
    stat_net_r: {
        term: "Net R",
        friendlyName: "Net R",
        definition: "Sum of R-multiples across all trades in the group.",
        whyItMatters:
            "Total contribution of the cohort; it scales with n, so compare cohorts of similar size " +
            "carefully.",
    },
    stat_avg_r: {
        term: "Avg R",
        friendlyName: "Average R (Expectancy)",
        definition: "Net R ÷ trade count, with breakevens included in the denominator.",
        whyItMatters:
            "The headline expectancy number — the +0.08 / +0.59 / +0.89R comparisons are all Avg R.",
    },
    stat_r: {
        term: "R",
        friendlyName: "R-Multiple",
        definition: "Trade result expressed in multiples of the initial risk (1R = the stop distance).",
        whyItMatters:
            "Risk-normalised P&L; lets trades of different pip sizes be compared and averaged.",
    },

    // ── Entry model / Triggered Edge ─────────────────────────────────────────
    te: {
        term: "TE",
        friendlyName: "Triggered Edge",
        definition:
            "Entry family where the limit only arms after price triggers the OB edge, optionally " +
            "after a candle delay. Delay variants are labelled C0–C3 (C0 = same candle … C3 = +3).",
        whyItMatters:
            "The entire AAE / vacant research only exists for TE entries — baseline trades have no " +
            "arm step.",
    },
    te_same: {
        term: "TE C0",
        friendlyName: "TE C0 — Same Candle",
        definition: "Limit arms and can fill on the same candle as the trigger (delay 0).",
        whyItMatters: "Shortest delay; least chance for price to vacate the OB before arming.",
    },
    te_next: {
        term: "TE C1",
        friendlyName: "TE C1 — Next Candle",
        definition: "Limit arms on the candle immediately after the trigger (delay 1).",
        whyItMatters: "First delay tier where AAE / vacant behaviour starts to appear.",
    },
    te_d2: {
        term: "TE C2",
        friendlyName: "TE C2 — +2 Delay",
        definition: "Limit arms after a 2-candle delay window (delay 2).",
        whyItMatters: "Longer delay → more vacate-and-return opportunity → more AAE.",
    },
    te_d3: {
        term: "TE C3",
        friendlyName: "TE C3 — +3 Delay",
        definition: "Limit arms after a 3-candle delay window (delay 3).",
        whyItMatters: "Highest AAE share in the full-history run; the richest cohort for the signal.",
    },

    // ── Sessions ─────────────────────────────────────────────────────────────
    session_new_york: {
        term: "New York",
        friendlyName: "New York Session",
        definition: "Trade filled during the New York session window.",
        whyItMatters: "Primary in-session cohort for vacant / AAE performance.",
    },
    session_london: {
        term: "London",
        friendlyName: "London Session",
        definition: "Trade filled during the London session window.",
        whyItMatters: "Core liquidity session; compare expectancy against New York.",
    },
    session_london_lull: {
        term: "London Lull",
        friendlyName: "London Lull",
        definition: "The mid-session lull between the London and New York overlap.",
        whyItMatters: "Lower-liquidity sub-window; expectancy can diverge from London proper.",
    },
    session_asia: {
        term: "Asia",
        friendlyName: "Asia Session",
        definition: "Trade filled during the Asia session window.",
        whyItMatters: "Thinner liquidity; sanity-check the sample size before trusting the row.",
    },
    session_outside: {
        term: "Outside",
        friendlyName: "Outside Session",
        definition: "Trade filled outside all defined session windows.",
        whyItMatters:
            "Danger condition: ~0% win rate and ~-1R avg in the full-history run — the single hardest " +
            "filter to apply.",
    },

    // ── Phase 2 — Research Signals & Confidence ──────────────────────────────
    research_signals: {
        term: "Research Signals",
        friendlyName: "Research Signals",
        definition:
            "Auto-surfaced strongest positive findings (edges) and strongest negative findings " +
            "(risks) from the tab's live data — deduplicated and confidence-scored.",
        whyItMatters:
            "A one-glance read of what the current data is actually saying, so you don't have to " +
            "scan every table to find the signal.",
    },
    effect: {
        term: "Effect",
        friendlyName: "Effect (Expectancy)",
        definition: "A finding's signed average R (avgR): positive is an edge, negative is a risk.",
        whyItMatters:
            "The size and direction of a finding's edge — what ranks signals against each other.",
    },
    confidence: {
        term: "Confidence",
        friendlyName: "Confidence",
        definition:
            "How trustworthy a finding is, from sample size and statistical stability. Levels: " +
            "Very Low, Low, Medium, High.",
        whyItMatters:
            "A big edge on a tiny or noisy sample isn't actionable; confidence stops flukes from " +
            "outranking real, well-evidenced findings.",
        interpretation: [
            "High — trustworthy enough to act on",
            "Medium — corroborate before leaning on it",
            "Low / Very Low — treat as a hint; gather more data",
        ],
    },
    confidence_high: {
        term: "High",
        friendlyName: "High Confidence",
        definition: "Large sample and a tightly-estimated result.",
        whyItMatters: "Trustworthy enough to act on, all else equal.",
    },
    confidence_medium: {
        term: "Medium",
        friendlyName: "Medium Confidence",
        definition: "Reasonable sample, but not conclusive.",
        whyItMatters: "Directionally useful; corroborate before leaning on it heavily.",
    },
    confidence_low: {
        term: "Low",
        friendlyName: "Low Confidence",
        definition: "Thin sample, or a wide / unstable estimate.",
        whyItMatters: "Treat as a hint, not evidence; gather more data.",
    },
    confidence_very_low: {
        term: "Very Low",
        friendlyName: "Very Low Confidence",
        definition: "Too little data to trust (e.g. fewer than ~5 decided trades).",
        whyItMatters: "Do not act on it; shown for completeness only.",
    },
    max_drawdown: {
        term: "Max DD",
        friendlyName: "Max Drawdown",
        definition:
            "The largest drop from a peak in cumulative R before a new peak — how deep this " +
            "variant's worst losing stretch went.",
        whyItMatters:
            "Lower drawdown generally means a smoother, safer strategy; critical for funded-account " +
            "risk limits.",
    },

    // ── Phase 1 — Explainability quick wins ──────────────────────────────────
    rr: {
        term: "RR",
        friendlyName: "Reward-to-Risk Ratio",
        definition:
            "Reward-to-risk ratio. RR 2 means the target is 2× the stop risk (1R = the stop distance).",
        whyItMatters:
            "RR and win rate together determine expectancy — a low win rate can still profit at high RR.",
        interpretation: [
            "Higher RR — tolerates a lower win rate",
            "Lower RR — needs a higher win rate",
        ],
    },
    fft: {
        term: "FFT",
        friendlyName: "First Failed Tag (FFT)",
        definition:
            "The move-away cancel filter. It cancels a triggered-edge order if price moves too far " +
            "past the order block edge before filling.",
        whyItMatters:
            "It trades fill rate for fewer fakeout entries.",
    },
    ghost: {
        term: "Ghost",
        friendlyName: "Ghost Trade",
        definition:
            "The hypothetical result of a trade that FFT cancelled, simulated as if it had been " +
            "allowed to run.",
        whyItMatters:
            "Ghosts show whether FFT is cancelling likely winners or likely losers.",
    },
    ep: {
        term: "EP",
        friendlyName: "Entry Penetration",
        definition:
            "The limit order is placed N% into the order block. Deeper entry can improve price but " +
            "reduce fill rate.",
        whyItMatters:
            "Controls the trade-off between entry-price quality and how often setups actually fill.",
    },
    stat_pf: {
        term: "PF",
        friendlyName: "Profit Factor",
        definition: "Gross wins divided by gross losses.",
        whyItMatters:
            "A quick read on whether winners outweigh losers, independent of trade count.",
        interpretation: [
            "Above 1.0 — profitable",
            "Above 1.5 — strong edge",
            "Below 1.0 — losing",
        ],
    },
    stat_exp: {
        term: "Exp",
        friendlyName: "Expectancy",
        definition: "Average R per trade (Net R ÷ trade count).",
        whyItMatters:
            "It combines win rate and reward/risk into one number.",
        interpretation: [
            "Positive — wins on average",
            "Negative — loses on average",
            "0 — breakeven",
        ],
    },
    results_basis: {
        term: "Results Basis",
        friendlyName: "Results Basis",
        definition:
            "How figures are measured. Raw R shows risk multiples. Current Equity shows account-based " +
            "results using starting balance and risk settings.",
        whyItMatters:
            "Switching basis changes the scale of every number on the page.",
    },
    ci_95: {
        term: "95% CI",
        friendlyName: "95% Confidence Interval",
        definition: "The likely range of the true value, given this sample size.",
        whyItMatters:
            "If the range crosses zero, the edge may not be reliable.",
        interpretation: [
            "Fully above 0 — reliable positive edge",
            "Crosses 0 — not yet reliable",
            "Wider — less certain",
        ],
    },
};

// ─────────────────────────────────────────────────────────────────────────────
// Lookup helper
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Safe glossary lookup.
 * Returns the entry for a known term key, or null for unknown keys so callers
 * can decide how to degrade (e.g. render the raw term without a tooltip).
 *
 * @param {string} key
 * @returns {{ term: string, friendlyName: string, definition: string, whyItMatters: string } | null}
 */
export function getGlossary(key) {
    return GLOSSARY[key] ?? null;
}
