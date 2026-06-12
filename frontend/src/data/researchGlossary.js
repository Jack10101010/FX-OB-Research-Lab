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
    mae: {
        term: "MAE",
        friendlyName: "Max Adverse Excursion",
        definition: "The deepest a trade went against you, in R, before exiting (≤ 0; -1R = the full stop distance).",
        whyItMatters: "For winners it shows how close the trade came to the stop before succeeding — the raw input for stop-buffer research.",
    },
    stop_pressure: {
        term: "Stop pressure",
        friendlyName: "Winner stop pressure",
        definition: "How close winning trades came to the stop before succeeding, grouped by worst adverse excursion (MAE).",
        whyItMatters: "Winners clustered near the stop mean a slightly tighter stop would have killed real wins; lots of shallow winners suggest room to tighten.",
    },
    stop_buffer_sensitivity: {
        term: "Stop-buffer sensitivity",
        friendlyName: "Stop-buffer sensitivity",
        definition: "How much the result depends on the stop distance — judged from how many winners dipped close to the stop before winning.",
        whyItMatters: "Flags whether stop placement is a fragile knob. It's directional only: confirming a tighter or looser stop helps needs a replay, since MAE can't say whether a moved stop would have been touched first.",
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
    mfe_reach: {
        term: "MFE reach",
        friendlyName: "How far losers reached before failing",
        definition: "The count of losing trades that reached at least a given R level in your favour (peak MFE) before stopping out.",
        whyItMatters: "Tells you how many losses were 'good trades that failed later' versus instant failures — the realized picture, with no break-even assumption attached.",
    },
    be_opportunity: {
        term: "Break-even opportunity",
        friendlyName: "Break-even opportunity (upper bound)",
        definition: "Per arm level, the losers that reached it in your favour — trades that could have armed a break-even stop there.",
        whyItMatters: "Points to which BE levels are worth testing. It's an optimistic upper bound (peak MFE only): it can't confirm BE would have triggered, nor how many winners the rule would cut. Validate with an exact BE backtest before acting.",
    },
    be_opportunity_upper_bound: {
        term: "Upper bound",
        friendlyName: "Why break-even figures are an upper bound",
        definition: "Break-even reach counts use peak MFE only — they show a trade could have armed BE, not that BE would have held.",
        whyItMatters: "MFE doesn't record whether price retraced to entry after arming, nor the winners a BE rule would cut. Treat 'savable R' as a ceiling and validate with an exact BE backtest.",
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
    lift: {
        term: "Lift",
        friendlyName: "Lift (over-representation)",
        definition: "A group's share of loss-R ÷ its share of trades. 1.0× is exactly its fair share.",
        whyItMatters: "Above 1.0× means the group loses disproportionately — a real driver, not just a high-volume bucket.",
        interpretation: [
            "2.0× — twice as damaging as expected",
            "1.0× — normal; loses in line with its volume",
            "0.5× — half as damaging as expected",
        ],
    },
    trade_share: {
        term: "Trade Share",
        friendlyName: "Trade share",
        definition: "A cohort's share of all trades (its trades ÷ total trades).",
        whyItMatters: "The denominator for lift — it's how big a slice of activity the cohort is, so you can tell whether its loss share is proportionate.",
    },
    loss_share: {
        term: "Loss Share",
        friendlyName: "Loss share",
        definition: "A cohort's share of all loss-R (its loss-R ÷ total loss-R).",
        whyItMatters: "How much of the total damage the cohort accounts for. Divided by trade share, it becomes lift.",
    },
    loss_rate_delta: {
        term: "Δ vs Baseline",
        friendlyName: "Loss-rate delta vs baseline",
        definition: "The cohort's loss rate minus the overall baseline loss rate (all losers ÷ all trades).",
        whyItMatters: "Answers 'does this group lose MORE OFTEN than usual?'. Positive = worse than baseline; negative = better. Needs winners in the population to mean anything.",
        interpretation: [
            "Positive (red) — loses more often than baseline",
            "Near zero — performs about as expected",
            "Negative (green) — loses less often than baseline",
        ],
    },
    penetration: {
        term: "OB Penetration",
        friendlyName: "Order-block penetration",
        definition: "How deeply price pushed into / through the order block before the trade failed, as a % of the OB (≥100% = price fully breached the block). Falls back to fill penetration % when OB penetration isn't exported.",
        whyItMatters: "Separates shallow rejections from deep structural breaks: deep-breach losers (>110%) are genuine invalidations, while shallow-fill losers may be stop-raid / timing failures worth a different fix.",
    },
    loss_rate_lift: {
        term: "Loss-rate lift",
        friendlyName: "Loss-rate lift vs baseline",
        definition: "A cohort's loss rate ÷ the baseline loss rate. 1.0× is exactly the baseline; 2.0× means it loses twice as often as the run overall.",
        whyItMatters: "A multiplier view of Δ-vs-baseline — only meaningful when the population includes winners. Above ~1.3× flags a genuinely failure-prone cohort, not just a high-volume one.",
    },
    backtest_action: {
        term: "Backtest action",
        friendlyName: "Backtest suggestion",
        definition: "A plain suggestion for what to try in the backtester for this setup, from its full win/loss record: Test disable (loss rate ≥ 65% with enough losses and real bucket damage), Watchlist (55–65%), Probably normal (< 55%), or Not enough sample.",
        whyItMatters: "Turns the row into a decision — it's a prompt to TEST disabling a setup in a backtest, never an automatic or live trading rule.",
        interpretation: [
            "Test disable — high loss rate; worth a backtest with this setup off",
            "Watchlist — elevated loss rate; keep an eye on it",
            "Probably normal — loses about as often as the rest",
            "Not enough sample — too few trades to judge",
        ],
    },
    overall_setup: {
        term: "Overall valid setup",
        friendlyName: "Overall setup performance",
        definition: "The full valid-trade win/loss record for this setup across the entire run — not limited to the selected MFE bucket.",
        whyItMatters: "Tells you whether the setup is genuinely poor overall (e.g. New York: 45 losses / 32 wins / 77 total / 58.4% loss rate), which is what decides if it's worth testing as a disable.",
    },
    net_r: {
        term: "Net R",
        friendlyName: "Net R",
        definition: "Total positive R minus total loss-R for the setup — using each trade's ACTUAL realized R (not the configured target RR). A small win (e.g. a scaled/partial or news-flattened exit at +0.4R) counts as +0.4R, not its target.",
        whyItMatters: "A setup can lose often yet still be net positive (or vice-versa). Net R is the bottom line for whether disabling it would help or hurt. In a selected bucket, Bucket Net R = the in-band winners' realized R minus the in-band losses.",
    },
    profit_factor: {
        term: "Profit Factor",
        friendlyName: "Profit Factor (PF)",
        definition: "Profit generated ÷ loss generated (total +R ÷ total −R) for the setup.",
        whyItMatters: "PF > 1.0 = profitable; PF < 1.0 = losing. A quick read on whether a setup pays for its losses.",
        interpretation: [
            "Above 1.0 — profitable (wins outweigh losses)",
            "≈ 1.0 — break-even",
            "Below 1.0 — losing (worth testing a disable)",
        ],
    },

    // ── Filter Discovery (Failures Lab V5 Phase 1) ───────────────────────────────
    filter_discovery: {
        term: "Filter Discovery",
        friendlyName: "Filter Discovery simulator",
        definition: "For each cohort (a session, structure, penetration band, pair, …) the simulator REMOVES the actual matching trades and recomputes Net R, win rate and profit factor from the remaining trades. Both sides are counted: the losses you'd avoid AND the winners you'd give up.",
        whyItMatters: "Turns diagnostics into decisions: 'this cohort is damaging' becomes 'disabling it would have changed the run by X R'. It is in-sample optimization on one run — treat results as hypotheses to re-test, not live trading instructions.",
    },
    net_r_impact: {
        term: "Net R Change",
        friendlyName: "Net R change if removed",
        definition: "Run Net R after removing the cohort minus Net R before — exactly the cohort's loss-R saved minus its winner-R lost, computed from the matched trades' actual realized R.",
        whyItMatters: "The single number that decides whether a filter helps: positive = the run would have been better without this cohort; negative = the filter costs more winners than it saves in losses.",
    },
    winner_r_lost: {
        term: "Winner R Lost",
        friendlyName: "Winner R lost (filter cost)",
        definition: "The total realized positive R of the WINNING trades the filter would also remove. Every filter has this cost side — cohorts rarely contain only losers.",
        whyItMatters: "The honest counterweight to 'loss R saved'. A cohort with a big loss pile can still be a bad filter if its winners are bigger.",
    },

    // ── OB Retest Lab (Phase C education layer; additive, no logic) ──────────────
    // Survival-taxonomy rename (OB-RETEST-SURVIVAL-DEFINITION-AUDIT-1, Phase 1):
    // the old "Survival Rate" is now Window Hold %; Reaction Success % is the headline.
    retest_window_hold: {
        friendlyName: "Window Hold %",
        definition: "Of retests that resolved (held or failed), the share with no close beyond the OB's far edge inside the reaction window (~10 candles). It does NOT require a favorable reaction, and it is not eventual survival — an OB can hold a window and be invalidated later (tracked separately as Eventual Failure, engine v2).",
        whyItMatters: "An honest short-horizon hold measure. It runs high by construction — use Reaction Success % to judge whether retests are actually tradeable.",
    },
    retest_reaction_success: {
        friendlyName: "Reaction Success %",
        definition: "Of resolved retests, the share that held the reaction window AND produced at least the configured minimum favorable move (reaction met). Open (right-censored) retests are excluded.",
        whyItMatters: "The headline metric: a retest only matters if the OB held and price actually reacted. Reaction Success + Weak Hold + Failure = 100% of resolved retests.",
    },
    retest_weak_hold: {
        friendlyName: "Weak Hold %",
        definition: "Of resolved retests, the share that held the reaction window but did NOT produce the minimum favorable move — price just sat there without breaching.",
        whyItMatters: "These padded the old 'Survival Rate'. A high weak-hold share means many 'holds' were untradeable.",
    },
    retest_eventual_failure: {
        friendlyName: "Eventual Failure %",
        definition: "Of touched OBs with a known end (never-touched excluded), the share EVER invalidated — on first touch, inside a retest window, or between windows (engine v2 checks every candle after first touch). OBs still alive when the data ends are censored and counted as not-failed, so this is a conservative lower bound.",
        whyItMatters: "The OB-level number users usually mean by 'survival' — did the zone eventually die? — as opposed to the per-retest window metrics above.",
    },
    retest_delayed_failure: {
        friendlyName: "Delayed Failure",
        definition: "An OB invalidated BETWEEN reaction windows — after a held window (or before any retest) but outside any window. Engine v2 detects these and stops tracking the OB, so re-entries into a dead zone ('zombie retests') are no longer counted. v1 backend artifacts predate this and may still contain zombies.",
        whyItMatters: "Shows how much OB failure happens outside the windows that per-retest metrics can see.",
    },
    retest_time_to_invalidation: {
        friendlyName: "Median Time to Invalidation",
        definition: "For invalidated OBs only, the median minutes from the OB's first touch to the breach that killed it (median, not mean — these times are heavily skewed).",
        whyItMatters: "How long a typical zone stays usable after price first interacts with it.",
    },
    retest_censored_obs: {
        friendlyName: "Alive at Data End (censored)",
        definition: "OBs that were never invalidated before the candle data ended (including any that hit the per-OB retest tracking cap). They are counted as not-failed in Eventual Failure %, which therefore understates true failure.",
        whyItMatters: "Keeps the eventual-failure rate honest — unknown endings are disclosed, not guessed.",
    },
    retest_engine_version: {
        friendlyName: "Retest Engine Version",
        definition: "v2 (continuous invalidation) checks for OB breaches on every candle after first touch and reports OB-level eventual failure. v1 only checked inside reaction windows, so v1 backend artifacts can include zombie retests and slightly inflated hold rates — re-export the run to upgrade. Schema v2.1 adds death-quality fields (kill margin, confirmation, re-held) and the MFE family on the same engine.",
        whyItMatters: "Explains why artifacts of different vintages can legitimately disagree, and which panels each artifact version can power.",
    },

    // ── OB Retest v2.1 — death-definition refinement + monetization terms ────────
    retest_kill_margin: {
        friendlyName: "Kill Margin",
        definition: "How far beyond the OB's far edge price was at the moment of invalidation, in pips (the close for close-beyond mode, the wick extreme for wick mode). On the evidence run the median was just 1.0 pip — half of all deaths were spread-sized.",
        whyItMatters: "Separates decisive breaks from technical deaths: kills that were both confirmed and never re-held carried ~3× the margin of everything else.",
    },
    retest_kill_confirmed: {
        friendlyName: "Confirmed Kill (Confirmation Timeframe)",
        definition: "Whether the confirmation-timeframe bucket containing the kill candle (default 15 minutes — tied to the run's detection timeframe) ALSO closed beyond the edge. Confirmation is close-based in both failure modes; a partial final bucket uses its last available close.",
        whyItMatters: "On the evidence run only ~63% of 1-minute kills were confirmed by the 15-minute close — the rest are deaths the chart timeframe never agreed with.",
    },
    retest_reheld_after_kill: {
        friendlyName: "Re-held After Kill",
        definition: "Whether price closed back inside the OB within 60 minutes of the kill. ~80% of killed zones re-held on the evidence run — most nominal deaths did not look structurally dead on the chart.",
        whyItMatters: "The strongest single flag that a recorded death was noise rather than a decisive break.",
    },
    retest_soft_kill: {
        friendlyName: "Soft Kill",
        definition: "The current (v2/v2.1) death event: the first execution-timeframe close beyond the far edge, buffer 0. Every eventual-failure stat is built on soft kills; the v2.1 fields grade each one (margin, confirmation, re-held) without changing it.",
        whyItMatters: "Soft kills saturate (~98% of touched zones eventually soft-kill under any tested definition) — the grade of the kill, not the kill itself, carries the information.",
    },
    retest_death_tiers: {
        friendlyName: "Death Tiers (planned — v2.2)",
        definition: "A planned upgrade (see OB-DEATH-QUALITY-AUDIT-1): grade each OB's death as soft → confirmed → decisive (confirmed + never re-held) → abandoned, with a time-to-death per tier. On the evidence run only ~20% of first kills were decisive, and those carried ~3× the kill margin. v2.1 records the ingredients but does NOT implement tier modelling — zones still terminate at the first soft kill.",
        whyItMatters: "Across every death definition tested, the eventual-failure RATE converges to ~92–98%; what differs — by two orders of magnitude — is WHEN death is declared. Tiers make time-to-death the first-class axis.",
    },
    retest_mfe_before_death: {
        friendlyName: "MFE Before Death",
        definition: "The maximum favorable excursion from the OB's near edge between first touch and invalidation (or data end for zones still alive), in pips. Candles after invalidation never count.",
        whyItMatters: "The zone's total payable opportunity before it died — the foundation of the monetization layer (evidence run: median ≈ 1.5R; ~63% of zones reached 1R before dying).",
    },
    retest_mfe_after_rk: {
        friendlyName: "MFE After R1 / R2 / R3",
        definition: "The same favorable-excursion measure, anchored at the first / second / third retest entry instead of the first touch (null when that retest never happened). Always ≤ MFE Before Death.",
        whyItMatters: "Tests whether retests consume the payout — first evidence says they don't (the 1R-capture rate measured from R1 matched the from-first-touch rate).",
    },
    retest_rr_capture: {
        friendlyName: "RR Capture",
        definition: "Of touched zones, the share whose MFE before death reached at least a given R multiple (1R, 1.5R, 2R, 2.5R, 3R, 3.5R, 4R, 4.5R, 5R), where 1R = the zone's own width.",
        whyItMatters: "The realistic-target curve: on the evidence run 1R was reached by ~63% of zones and 2R by ~46% — each higher target roughly halves the hit rate.",
    },
    retest_idealized_r: {
        friendlyName: "Idealized R Unit",
        definition: "In the monetization layer, 1R = the OB's width: entry at the near edge, stop at the far edge, perfect fills, no spread. It measures OPPORTUNITY, not realized PnL — treat every R-based capture figure as an upper bound.",
        whyItMatters: "One pinned definition prevents the lab's most quotable numbers from being misread as achievable trade results.",
    },
    retest_suggested_target: {
        friendlyName: "Suggested Target",
        definition: "The furthest R target most zones in this cohort actually reached before dying — the largest R level whose capture share clears the target floor (50% by default). Marked “≈” when it falls back to the cohort's median MFE because no level cleared the floor.",
        whyItMatters: "A realistic take-profit ceiling grounded in what this specific group of zones did, not a hoped-for number — and still an idealized opportunity, not realized PnL.",
    },
    retest_be_trigger: {
        friendlyName: "Suggested BE Trigger",
        definition: "A conservative level where moving the stop to break-even might make sense, taken from the capture curve: the smallest R a strong majority of the cohort (70% by default) reached. This is a first transparent heuristic, NOT a proven break-even strategy yet.",
        whyItMatters: "Points at where downside protection looks cheapest to add as a starting hypothesis for break-even testing — treat it as a prompt to investigate, not a validated rule.",
    },
    retest_monetization: {
        friendlyName: "Monetization Before Death",
        definition: "How much idealized opportunity each touched zone offered before it was invalidated: the RR capture curve, the time-to-invalidation distribution, and MFE decay across successive retests. Requires v2.1 data (frontend-derived, or a re-exported v2.1 artifact).",
        whyItMatters: "Zones almost always die — the tradeable question is how much they pay first, and which conditions pay best.",
    },
    retest_tti_distribution: {
        friendlyName: "Time To Invalidation Distribution",
        definition: "How long zones survive from first touch to invalidation, bucketed <15m / 15-60m / 1-4h / 4-24h / 1-7d / >7d. Zones still alive at data end (or tracking-capped) are 'censored' — shown, never mixed into a time bucket.",
        whyItMatters: "The distribution is extremely skewed (evidence run: p25 ≈ 16m, p75 ≈ 19h) — a single median misleads; the shape is the finding.",
    },
    retest_decay_by_retest: {
        friendlyName: "Decay By Retest",
        definition: "MFE measured from each retest entry (R1 / R2 / R3) to the zone's death, in idealized R — does the payout shrink with each successive retest?",
        whyItMatters: "First evidence says retests do NOT consume the payout (1R capture from R1 matched first-touch capture) — confirming or refuting that across runs decides how late retests can be traded.",
    },
    retest_backend_computed: {
        friendlyName: "Backend Computed",
        definition: "These retest events were computed by the backend exporter and imported as artifacts (rather than derived in-browser from candles). It is a statement about the data's source, not a validation of the metric definitions. Check the engine-version badge: v1 artifacts predate the continuous-invalidation fix.",
        whyItMatters: "Backend and frontend implement the same logic — provenance differs, definitions (and their caveats) are identical.",
    },
    // Legacy key (pre-rename) — kept so older surfaces still resolve. Same meaning
    // as retest_window_hold; do not present as "Survival" anywhere new.
    retest_survival: {
        friendlyName: "Window Hold % (formerly Survival Rate)",
        definition: "Of retests that resolved (held or failed), the share that held without a close-breach inside the reaction window. Weak/no-reaction holds count; failures after the window are not yet detected. Open (right-censored) retests are excluded.",
        whyItMatters: "Renamed from 'Survival Rate' because it measures a short window hold, not eventual OB survival. See Reaction Success % for the headline.",
    },
    retest_rate: {
        friendlyName: "Retest Rate",
        definition: "Of order blocks that had a first touch, the share that were later revisited at least once.",
        whyItMatters: "Shows how often OBs are actually re-tested at all — the denominator for everything else here.",
    },
    retest_failure_rate: {
        friendlyName: "Failure Rate",
        definition: "Of retests that resolved (held or failed), the share that failed — price re-entered and then breached the OB within the reaction window. Open retests are excluded. = 1 − window hold %. Failures occurring after the window are not yet counted.",
        whyItMatters: "The complement of window hold; high failure means retested OBs are breaking rather than holding.",
    },
    retest_candles_to_failure: {
        friendlyName: "Median Candles to Failure",
        definition: "For failed retests only, the median number of candles from re-entry until the breach (median, not mean — failure times are skewed and window-truncated).",
        whyItMatters: "How quickly a typical failing retest breaks — fast breaks leave little room to react.",
    },
    retest_open: {
        friendlyName: "Open (Excluded)",
        definition: "Retests whose reaction window extended past the available data (right-censored). Counted but excluded from hold/reaction/failure rates.",
        whyItMatters: "Keeps rates honest — unresolved retests aren't scored as wins or losses.",
    },
    retest_reaction: {
        friendlyName: "Avg Max Favorable",
        definition: "The maximum favorable excursion within the reaction window — how far price moved away from the order block after the retest, in pips. Averaged over resolved retests; it is a best-case within-window move, not a realized result.",
        whyItMatters: "Window hold says the OB held; max favorable says how tradeable that hold could have been.",
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
        definition: "Whether the retest's reaction met the configured minimum pip threshold (met) or not (missed). Independent of the window-hold outcome — combined they define Reaction Success (held + met) vs Weak Hold (held + missed).",
        whyItMatters: "An OB can hold the window without producing a tradeable move — this separates the two.",
    },
    retest_intelligence: {
        friendlyName: "Retest Intelligence",
        definition: "The hero summary that surfaces the strongest and weakest retest conditions and deterministic key findings from the breakdowns below.",
        whyItMatters: "Turns a wall of tables into the few conditions that actually matter.",
    },
    retest_strongest_segment: {
        friendlyName: "Strongest Segment",
        definition: "The single condition with the highest (or lowest) reaction success rate among groups meeting the minimum sample size. Window hold is shown alongside as the secondary stat.",
        whyItMatters: "The clearest single signal to investigate first.",
    },
    retest_best_worst: {
        friendlyName: "Top Conditions",
        definition: "Conditions ranked by reaction success rate (held + minimum favorable move), filtered to those with at least the minimum sample size; thin slices are excluded from ranking.",
        whyItMatters: "Highlights where retests actually pay off best and worst without overfitting tiny samples.",
    },
    retest_key_findings: {
        friendlyName: "Key Findings",
        definition: "Deterministic, data-driven statements comparing two existing buckets (e.g. R2 vs R1) on reaction success, gated by minimum sample and a minimum gap. No AI, no scoring.",
        whyItMatters: "Plain-language read of the most material differences in the data.",
    },
    retest_session_matrix: {
        friendlyName: "Session Matrix",
        definition: "A grid of reaction success rate (with window hold beneath) by origin session (rows) versus retest session (columns), with the same minimum-sample safeguards.",
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
