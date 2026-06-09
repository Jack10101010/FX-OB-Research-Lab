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
        interpretation: [
            "Edges — strongest positive findings to lean into",
            "Risks — strongest negative findings to avoid",
            "Weigh each by its confidence chip before acting",
        ],
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
    },
    fft: {
        term: "FFT",
        friendlyName: "First Failed Tag (FFT)",
        definition:
            "The move-away cancel filter. It cancels a triggered-edge order if price moves too far " +
            "past the order block edge before filling.",
        whyItMatters:
            "It trades fill rate for fewer fakeout entries.",
        interpretation: [
            "Ghost losses avoided — FFT is helping",
            "Ghost wins removed — FFT is costing you",
            "Confirm against the paired FFT-OFF run",
        ],
    },
    ghost: {
        term: "Ghost",
        friendlyName: "Ghost Trade",
        definition:
            "The hypothetical result of a trade that FFT cancelled, simulated as if it had been " +
            "allowed to run.",
        whyItMatters:
            "Ghosts show whether FFT is cancelling likely winners or likely losers.",
        interpretation: [
            "Net R impact positive — cancels helped",
            "Net R impact negative — cancels hurt",
            "Estimate only — the paired OFF run is authoritative",
        ],
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
        definition: "Gross wins ÷ gross losses. Above 1.0 is profitable; below 1.0 is losing.",
        whyItMatters:
            "A quick read on whether winners outweigh losers, independent of trade count.",
    },
    stat_exp: {
        term: "Exp",
        friendlyName: "Expectancy",
        definition:
            "Average R per trade (Net R ÷ trade count). Positive means it profits on average.",
        whyItMatters:
            "It combines win rate and reward/risk into one number.",
    },
    results_basis: {
        term: "Results Basis",
        friendlyName: "Results Basis",
        definition:
            "How figures are measured. Raw R shows risk multiples. Current Equity shows account-based " +
            "results using starting balance and risk settings.",
        whyItMatters:
            "Switching basis changes the scale of every number on the page.",
        interpretation: [
            "Raw R — compare edges fairly, account-independent",
            "Current Equity — see real, compounded account impact",
        ],
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

    // ── Failures Lab · Distance to Stop (MFE) ────────────────────────────────────
    distance_before_stop: {
        term: "Distance Before Stop",
        friendlyName: "Distance Before Stop",
        definition: "How far a losing trade moved in your favour (in R) before it ultimately stopped out.",
        whyItMatters: "Separates trades that never worked from trades that nearly hit target — the core input for break-even and partials research.",
    },
    mfe: {
        term: "MFE",
        friendlyName: "Max Favourable Excursion",
        definition: "The peak profit, in R, a trade reached before exiting (1R = the stop distance).",
        whyItMatters: "It's the highest a trade got in your favour — what a break-even or partial could have captured.",
    },
    raw_r_bucket: {
        term: "Raw R bucket",
        friendlyName: "Raw R bucket",
        definition: "Losers grouped by how far they moved in your favour, measured in R (not % of target).",
        whyItMatters: "R buckets survive RR / target changes and map directly to risk, so the read stays valid as the strategy evolves.",
    },
    dist_never_moved: {
        term: "Never moved",
        friendlyName: "Never moved in favour",
        definition: "Losers whose favourable excursion was effectively zero — price never moved your way.",
        whyItMatters: "Break-even can't help these; they fail at or near entry.",
    },
    dist_instant_failure: {
        term: "Instant failure",
        friendlyName: "Instant failure",
        definition: "Losers that moved less than 0.25R in favour before stopping out.",
        whyItMatters: "Too little favourable movement for any break-even or partial to engage.",
    },
    dist_almost_worked: {
        term: "Almost worked",
        friendlyName: "Almost worked",
        definition: "Losers that reached 1R or more in favour before failing.",
        whyItMatters: "These are the strongest break-even / partial candidates — they moved a full risk distance your way first.",
    },
    contribution_pct: {
        term: "Contribution %",
        friendlyName: "Loss-R contribution %",
        definition: "A group's share of total loss-R — how much of the damage it accounts for.",
        whyItMatters: "Ranks by damage, not failure rate: a 65% rate on 40 trades hurts more than 90% on 5.",
    },
    loss_r_contribution: {
        term: "Loss-R",
        friendlyName: "Loss-R contribution",
        definition: "Total R lost by the trades in a group (sum of their negative R).",
        whyItMatters: "The absolute size of the damage a session, structure, or setup is causing.",
    },

    // ── OB Retest Lab (Phase C education layer; additive, no logic) ──────────────
    retest_survival: {
        friendlyName: "Survival Rate",
        definition: "Of retests that resolved (survived or failed), the share that survived — i.e. price re-entered the order block and it held without a breach inside the reaction window. Open (right-censored) retests are excluded.",
        whyItMatters: "The headline measure of whether a retested OB still offers a reaction or has lost its edge.",
    },
    retest_rate: {
        friendlyName: "Retest Rate",
        definition: "Of order blocks that had a first touch, the share that were later revisited at least once.",
        whyItMatters: "Shows how often OBs are actually re-tested at all — the denominator for everything else here.",
    },
    retest_failure_rate: {
        friendlyName: "Failure Rate",
        definition: "Of retests that resolved (survived or failed), the share that failed — price re-entered and then breached the OB within the reaction window. Open retests are excluded. = 1 − survival rate.",
        whyItMatters: "The complement of survival; high failure means retested OBs are breaking rather than holding.",
    },
    retest_candles_to_failure: {
        friendlyName: "Avg Candles to Failure",
        definition: "For failed retests only, the average number of candles from re-entry until the breach.",
        whyItMatters: "How quickly a failing retest breaks — fast breaks leave little room to react.",
    },
    retest_open: {
        friendlyName: "Open (Excluded)",
        definition: "Retests whose reaction window extended past the available data (right-censored). Counted but excluded from survival/failure rates.",
        whyItMatters: "Keeps rates honest — unresolved retests aren't scored as wins or losses.",
    },
    retest_reaction: {
        friendlyName: "Reaction",
        definition: "How far price moved away from the order block after the retest, measured in pips (favorable excursion).",
        whyItMatters: "Survival says the OB held; reaction says how tradeable that hold actually was.",
    },
    retest_sample: {
        friendlyName: "Sample Size (n)",
        definition: "The number of retest events in this group. Groups below the minimum sample are shown but not ranked or color-emphasized.",
        whyItMatters: "Small samples produce unreliable rates — n guards against reading noise as edge.",
    },
    retest_number: {
        friendlyName: "Retest Number",
        definition: "Which return this is for the same OB after first touch: R1 (first retest), R2 (second), R3+ (third or later).",
        whyItMatters: "Later retests may behave differently — testing whether an OB weakens or strengthens with repeated touches.",
    },
    retest_ob_size: {
        friendlyName: "OB Size",
        definition: "The order block's height in pips, bucketed small (<10p) / medium (10–20p) / large (>20p).",
        whyItMatters: "Size can relate to how decisively price reacts on a retest.",
    },
    retest_origin_session: {
        friendlyName: "Origin Session",
        definition: "The trading session in which the order block's origin candle formed.",
        whyItMatters: "Where an OB was created may predict how well it holds on later retests.",
    },
    retest_retest_session: {
        friendlyName: "Retest Session",
        definition: "The trading session in which the retest itself occurred.",
        whyItMatters: "Liquidity and volatility differ by session, which can change retest outcomes.",
    },
    retest_same_cross_session: {
        friendlyName: "Same vs Cross Session",
        definition: "Whether the retest happened in the same session as the first touch (same) or a different one (cross).",
        whyItMatters: "Cross-session retests test the OB after a regime/liquidity change.",
    },
    retest_structure: {
        friendlyName: "Structure (BOS / CHoCH)",
        definition: "The structural break that created the OB — Break of Structure (continuation) or Change of Character (reversal).",
        whyItMatters: "Continuation and reversal blocks can have different retest reliability.",
    },
    retest_direction: {
        friendlyName: "Direction",
        definition: "Whether the order block is bullish (demand) or bearish (supply).",
        whyItMatters: "Lets you check for long/short asymmetry in retest survival.",
    },
    retest_structure_direction: {
        friendlyName: "Structure × Direction",
        definition: "The combination of structure (BOS/CHoCH) and direction (bull/bear), e.g. 'CHoCH bear'.",
        whyItMatters: "Surfaces specific institutional patterns that a single dimension would hide.",
    },
    retest_entry_penetration: {
        friendlyName: "Entry Penetration",
        definition: "How deep price was inside the OB on the candle that began the retest, bucketed clean (0–33%) / mid (33–66%) / deep (66–99%) / full (100%).",
        whyItMatters: "Shallow taps vs deep pushes into the block can resolve very differently.",
    },
    retest_max_penetration: {
        friendlyName: "Max Penetration",
        definition: "The deepest price reached into the OB during the retest window, bucketed clean / mid / deep / full.",
        whyItMatters: "A full penetration that doesn't close beyond is a different signal than a clean rejection.",
    },
    retest_time_since_detection: {
        friendlyName: "Time Since Detection",
        definition: "Elapsed time from when the OB was detected to this retest (<1h / 1–6h / 6–24h / 1–3d / 3d+).",
        whyItMatters: "Tests whether OBs decay (or mature) with age before being retested.",
    },
    retest_time_since_first_touch: {
        friendlyName: "Time Since First Touch",
        definition: "Elapsed time from the OB's first touch to this retest (<30m / 30m–2h / 2–8h / 8–24h / 24h+).",
        whyItMatters: "Quick re-tests vs delayed returns can carry different odds.",
    },
    retest_time_since_prev: {
        friendlyName: "Time Since Previous Retest",
        definition: "Elapsed time from the previous retest of the same OB ('first' for R1, then bucketed).",
        whyItMatters: "Rapid repeated retests may signal a weakening block.",
    },
    retest_first_touch_outcome: {
        friendlyName: "First-Touch Outcome",
        definition: "What happened on the OB's first interaction — win / loss / breakeven / untraded (no setup placed).",
        whyItMatters: "Conditions later retest behavior on how the OB first resolved.",
    },
    retest_failure_behavior: {
        friendlyName: "Failure Behaviour",
        definition: "Joint outcome × depth class: survived/failed × shallow/deep (deep = max penetration ≥ 66%), or 'open'.",
        whyItMatters: "Distinguishes clean shallow holds from deep saves, and shallow vs deep failures.",
    },
    retest_reaction_quality: {
        friendlyName: "Reaction Quality",
        definition: "Whether the retest's reaction met the configured minimum pip threshold (met) or not (missed). Independent of survival.",
        whyItMatters: "An OB can 'survive' without producing a tradeable move — this separates the two.",
    },
    retest_intelligence: {
        friendlyName: "Retest Intelligence",
        definition: "The hero summary that surfaces the strongest and weakest retest conditions and deterministic key findings from the breakdowns below.",
        whyItMatters: "Turns a wall of tables into the few conditions that actually matter.",
    },
    retest_strongest_segment: {
        friendlyName: "Strongest Segment",
        definition: "The single condition with the highest (or lowest) survival rate among groups meeting the minimum sample size.",
        whyItMatters: "The clearest single signal to investigate first.",
    },
    retest_best_worst: {
        friendlyName: "Top Conditions",
        definition: "Conditions ranked by survival rate, filtered to those with at least the minimum sample size; thin slices are excluded from ranking.",
        whyItMatters: "Highlights where retests work best and worst without overfitting tiny samples.",
    },
    retest_key_findings: {
        friendlyName: "Key Findings",
        definition: "Deterministic, data-driven statements comparing two existing buckets (e.g. R2 vs R1), gated by minimum sample and a minimum survival-gap. No AI, no scoring.",
        whyItMatters: "Plain-language read of the most material differences in the data.",
    },
    retest_session_matrix: {
        friendlyName: "Session Matrix",
        definition: "A grid of survival rate by origin session (rows) versus retest session (columns), with the same minimum-sample safeguards.",
        whyItMatters: "Reveals origin/retest session combinations that a one-dimensional breakdown would miss.",
    },

    // ── OB Retest origin-candle structure (Phase C2) ─────────────────────────────
    retest_origin_candle: {
        friendlyName: "Origin Candle",
        definition: "The candle whose OHLC formed the order block (its open/high/low/close).",
        whyItMatters: "The shape of the candle that created an OB may predict how well it holds on later retests.",
    },
    retest_body_pct: {
        friendlyName: "Body %",
        definition: "The origin candle's body (|close − open|) as a percent of its full range (high − low).",
        whyItMatters: "High body % = decisive/impulsive origin; low body % = indecision or rejection.",
    },
    retest_upper_wick: {
        friendlyName: "Upper Wick %",
        definition: "The origin candle's upper wick (high − body top) as a percent of its range.",
        whyItMatters: "A large upper wick signals rejection from above at the OB's origin.",
    },
    retest_lower_wick: {
        friendlyName: "Lower Wick %",
        definition: "The origin candle's lower wick (body bottom − low) as a percent of its range.",
        whyItMatters: "A large lower wick signals rejection from below at the OB's origin.",
    },
    retest_body_dominance: {
        friendlyName: "Body Dominance",
        definition: "Origin body share bucket: body_light (<35%), body_balanced (35–65%), body_dominant (>65%).",
        whyItMatters: "Tests whether decisive (body-dominant) origins produce more reliable retests than indecisive ones.",
    },
    retest_wick_dominance: {
        friendlyName: "Wick Dominance",
        definition: "Bucket of the larger single wick as a % of range: low_wick (<25%), balanced_wick (25–50%), high_wick (>50%).",
        whyItMatters: "High-wick origins (strong rejection) may behave differently on retest than clean-body origins.",
    },
    retest_dominant_wick: {
        friendlyName: "Dominant Wick Side",
        definition: "Which wick is larger on the origin candle — upper, lower, or even.",
        whyItMatters: "The rejection side at origin can hint at directional conviction.",
    },
    retest_origin_range: {
        friendlyName: "Origin Range",
        definition: "The origin candle's high−low range in pips, bucketed small (<10p) / medium (10–20p) / large (>20p).",
        whyItMatters: "Large origin ranges mark more volatile creation conditions, which may change retest odds.",
    },
    retest_impulse_proxy: {
        friendlyName: "Impulse Proxy (experimental)",
        definition: "Distance from the origin close to the structure break level, in pips, bucketed weak (<20p) / medium (20–50p) / strong (>50p). 'unknown' when break level or OHLC is missing.",
        whyItMatters: "A rough stand-in for displacement strength until a true displacement field is exported (C3).",
    },
    retest_break_level: {
        friendlyName: "Break Level",
        definition: "The structure level whose break confirmed the order block (BOS/CHoCH trigger price).",
        whyItMatters: "Used as the reference for the impulse proxy — how far price displaced to confirm the break.",
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
