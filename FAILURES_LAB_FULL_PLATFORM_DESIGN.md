# Failures Lab — Full Premium Platform Design
**Version:** 2.0 — Expanded Architecture  
**Date:** May 2026  
**Mode:** Product architecture + feature design — NO implementation  
**Supersedes:** FAILURES_LAB_DESIGN.md (V1)  
**Platform:** FX-OB Research Lab · React + Tailwind · Client-side · Modular workspace pattern

---

## Design Mandate

Failures Lab is a forensic research terminal for understanding why trades fail, classifying failure archetypes, detecting recurring patterns, and generating actionable prevention strategies. It is not a loser statistics page. It is not a protection simulator. It is the platform's intelligence engine for turning losses into edge.

The mental model is: **flight recorder + quant forensics lab + institutional strategy review.**

Every feature must serve one of four research questions:
1. *What type of failure was this?* (Classification)
2. *What conditions predicted it?* (Forensics)
3. *When and how does this pattern cluster?* (Intelligence)
4. *What should I do about it?* (Prevention)

---

## 1. Platform Architecture

### 1.1 Workspace Shell Pattern

Failures Lab follows the EntriesLab modular workspace pattern — NOT the ProtectionLab single-page pattern. The workspace shell (`FailuresLab.jsx`) owns the tab rail, the global filter bar, and the data quality banner. All analysis lives in isolated sub-modules.

```
frontend/src/
├── pages/
│   └── FailuresLab.jsx                    — Workspace shell, tab router, global state
│
└── components/lab/failures/
    │
    ├── shared/                             — Zero React. Pure analytics + utilities.
    │   ├── failuresUtils.js               — Loser filtering, field normalisation, derives
    │   ├── failuresRegistry.js            — Archetype taxonomy, fingerprint criteria, severity
    │   ├── failuresFormatters.js          — Display helpers, R colouring, archetype tokens
    │   ├── failuresAnalytics.js           — Pure: MAE/MFE, streaks, asymmetry, timing
    │   ├── archetypeClassifier.js         — Pure: classify(trade) → { archetype, confidence }
    │   ├── falseLosers.js                 — Pure: detectFalseLosers(trades) → annotated set
    │   ├── severityScorer.js              — Pure: scoreSeverity(trade, context) → 0–10
    │   ├── regimeDetector.js              — Pure: rolling window deviation, regime tagging
    │   ├── cohortEngine.js                — Pure: buildCohort(trades, filters), compareCohorts
    │   ├── preventionEngine.js            — Pure: generateRecommendations(trades) → ranked
    │   ├── failuresDataQuality.js         — Field coverage detection, confidence badges
    │   └── failuresExporter.js            — CSV / JSON / report export builders
    │
    ├── global/                             — Workspace-level UI (rendered by shell)
    │   ├── FailuresCohortFilter.jsx        — Persistent global filter bar
    │   ├── FailuresDataQualityBanner.jsx   — Field coverage + degradation warnings
    │   ├── FailuresSavedViews.jsx          — Saved forensic view picker
    │   └── FailuresWorkspaceNotes.jsx      — Session-level freetext research notes
    │
    ├── overview/                           — Module 01
    │   ├── FailuresOverview.jsx
    │   ├── FailureKPIStrip.jsx
    │   ├── FailureEquityImpact.jsx
    │   ├── ArchetypeDistributionSummary.jsx
    │   └── OverviewNavCards.jsx
    │
    ├── archetypes/                         — Module 02
    │   ├── FailureDNA.jsx                  — Archetype roster page
    │   ├── FailureDNACard.jsx              — Single archetype card (rich)
    │   ├── ArchetypeDetail.jsx             — Drilldown into one archetype
    │   ├── FingerprintRadar.jsx            — Radar/spider chart per archetype
    │   ├── ClassificationConfidence.jsx    — Confidence distribution panel
    │   └── ArchetypeMatrix.jsx             — Archetype × dimension matrix view
    │
    ├── falselosers/                        — Module 03
    │   ├── FalseLosersOverview.jsx
    │   ├── StopRaidAnalysis.jsx
    │   ├── CostDrivenAnalysis.jsx
    │   ├── RetestWinnerAnalysis.jsx
    │   ├── DirectionalWinnerAnalysis.jsx
    │   ├── TimingFalseLosers.jsx
    │   └── TrueMetricsPanel.jsx            — "Real" stats with false losers removed
    │
    ├── cohort/                             — Module 04
    │   ├── CohortComparison.jsx
    │   ├── CohortBuilder.jsx               — A/B cohort filter composer
    │   ├── CohortPresets.jsx               — Long/Short, London/NY, etc.
    │   ├── CohortMetricsTable.jsx          — Side-by-side with delta column
    │   ├── CohortArchetypeCompare.jsx      — Stacked bar comparison
    │   ├── CohortScatterOverlay.jsx        — MAE/MFE overlay (two cohorts)
    │   └── CohortExport.jsx
    │
    ├── temporal/                           — Module 05
    │   ├── FailuresTemporal.jsx
    │   ├── TemporalHeatmap.jsx             — Weekday × Hour failure rate
    │   ├── WinFailureDelta.jsx             — Failure vs win rate delta by time
    │   ├── SeasonalPatterns.jsx            — Monthly/quarterly/seasonal
    │   ├── FailureRegimeMonitor.jsx        — Rolling window deviation alerts
    │   ├── WhatChangedComparison.jsx       — Period A vs Period B
    │   └── RegimeEquityOverlay.jsx         — Regime zones on equity curve
    │
    ├── prefailure/                         — Module 06
    │   ├── PreFailureForensics.jsx
    │   ├── ConditionScorecard.jsx          — Factor → failure correlation matrix
    │   ├── HTFContextPanel.jsx
    │   ├── SweepPresencePanel.jsx
    │   ├── DisplacementStrengthPanel.jsx
    │   ├── OpposingLiquidityPanel.jsx
    │   ├── PremiumDiscountPanel.jsx
    │   └── OverextensionPanel.jsx
    │
    ├── excursion/                          — Module 07
    │   ├── ExcursionLab.jsx
    │   ├── MAEMFEScatter.jsx               — Main scatter plot
    │   ├── ReversalBeforeFailure.jsx       — How far before stopping
    │   ├── PostStopContinuation.jsx        — How far past stop
    │   ├── StopEfficiency.jsx              — Stop sizing research
    │   └── PartialRecoveryRate.jsx
    │
    ├── direction/                          — Module 08
    │   ├── DirectionalAsymmetry.jsx
    │   ├── DirectionMetricsCompare.jsx
    │   ├── DirectionArchetypeBreakdown.jsx
    │   ├── TailRiskByDirection.jsx
    │   └── DirectionTPOptimiser.jsx
    │
    ├── sessions/                           — Module 09
    │   ├── SessionFailures.jsx
    │   ├── SessionFailureRates.jsx
    │   ├── OriginFillSessionMatrix.jsx
    │   └── SessionArchetypeBreakdown.jsx
    │
    ├── news/                               — Module 10
    │   ├── NewsFailures.jsx
    │   ├── NewsProximityGradient.jsx
    │   └── NewsArchetypeInteraction.jsx
    │
    ├── replay/                             — Module 11
    │   ├── FailureReplay.jsx               — Master controller
    │   ├── ReplayCard.jsx                  — Single trade card (rich)
    │   ├── ReplayNavigation.jsx            — Progress + keyboard shortcuts
    │   ├── ReplayFilters.jsx               — Filter to archetype / confidence / tagged
    │   └── ReplayTagOverride.jsx           — Inline manual reclassification
    │
    ├── streaks/                            — Module 12
    │   ├── StreakAnalysis.jsx
    │   ├── ConsecutiveLossPanel.jsx
    │   ├── RunsTestPanel.jsx               — Wald-Wolfowitz statistical test
    │   ├── SequenceDependency.jsx          — P(loss N+1 | loss N)
    │   └── StreakEquityOverlay.jsx
    │
    ├── prevention/                         — Module 13
    │   ├── PreventionEngine.jsx
    │   ├── FilterRecommendations.jsx       — Ranked rule suggestions
    │   ├── WouldThisHaveHelped.jsx         — Cohort → filter catch rate
    │   ├── CombinedFilterAnalysis.jsx      — Compound rule builder
    │   └── PreventionHypothesisExport.jsx  — → HypothesisLab bridge
    │
    ├── crossrun/                           — Module 14
    │   ├── CrossRunComparison.jsx
    │   ├── CrossRunArchetypeMatrix.jsx
    │   ├── CrossRunMetricsTable.jsx
    │   └── SharedVsRunSpecific.jsx
    │
    ├── drilldown/                          — Module 15
    │   ├── FailureDrilldown.jsx
    │   ├── FailureTradeTable.jsx           — Sortable, filterable loser table
    │   ├── FailureTradeDetail.jsx          — Single trade forensic panel
    │   ├── FailureTimeline.jsx             — Entry → MFE → reversal → exit lifecycle
    │   └── ManualTagPanel.jsx
    │
    └── workspace/                          — Module 16
        ├── SavedForensicViews.jsx
        ├── ExportSystem.jsx
        ├── ViewManager.jsx
        └── WorkspaceSettings.jsx
```

### 1.2 Tab Rail Definition

The workspace shell renders a 16-module tab rail. Tabs are grouped into four logical sections with visual separators:

**INTELLIGENCE**
01 · Overview
02 · DNA & Archetypes
03 · False Losers

**ANALYSIS**
04 · Cohort Compare
05 · Temporal & Regime
06 · Pre-Entry Forensics
07 · Excursion Science
08 · Directional
09 · Sessions
10 · News

**RESEARCH TOOLS**
11 · Replay
12 · Streaks & Sequence
13 · Prevention Engine
14 · Cross-Run

**WORKSPACE**
15 · Drilldown
16 · Views & Export

---

## 2. Global System Components

### 2.1 Failure Cohort Filter (`FailuresCohortFilter.jsx`)

The most important UX element in the lab. Renders as a sticky bar below the tab rail. Persists across all modules. Its state is the "active research context" for every sub-module.

**Controls:**

| Control | Type | Field source |
|---|---|---|
| Archetype | Multi-select pills | `archetype` (classified) |
| Direction | Tri-toggle | `direction` (long / short / all) |
| Session | Multi-select pills | `session` |
| Date range | Date picker pair | `entry` timestamp |
| Structure | Tri-toggle | `structure` (BOS / CHoCH / all) |
| False loser mode | Toggle | `is_false_loser` |
| Custom cohort | Query mode button | Opens `CohortBuilder` |
| Saved view | Dropdown | `fxob_failures_saved_views` |

**Active state display:** When filters are active, each active criterion renders as a dismissible pill chip directly in the filter bar. A "Clear all" button appears. A trade count badge shows "Showing N of M losses."

**Comparison mode:** A "Compare" toggle splits the workspace into two parallel cohorts (A and B), each with its own filter bar. Modules that support comparison mode render side-by-side panels. Modules that don't support it show only the primary cohort.

**State persistence:** `fxob_failures_cohort_filter` in localStorage. Restored on mount.

---

### 2.2 Data Quality Banner (`FailuresDataQualityBanner.jsx`)

Renders above the active module content when any field dependency is unmet. Mirrors the `ProtectionDataQualityPanel` pattern already established.

For each module, a static dependency map defines which fields it requires. On mount, the banner scans the active dataset for field coverage and shows:

| Field | Coverage | Status |
|---|---|---|
| `mae` | 0% | ⚠ Required for Excursion Lab |
| `mfe` | 0% | ⚠ Required for Excursion, Replay, DNA cards |
| `post_stop_continuation_r` | 0% | ⚠ Required for False Loser detection |
| `ob_age_candles` | 0% | ⚠ Required for OB Survival Curve |
| `htf_context` | 0% | ⚠ Required for Pre-Entry Forensics |
| `sweep_present` | 0% | ⚠ Required for Pre-Entry Forensics |
| `entry` (timestamp) | 100% | ✓ |
| `direction` | 100% | ✓ |
| `session` | 100% | ✓ |
| `outcome` | 100% | ✓ |
| `r` | 100% | ✓ |
| `ob_width` | 100% | ✓ |

Each module that requires missing fields shows an "Estimated mode" badge in its panel header. It never hides itself — it renders what it can with available data, and clearly labels what's unavailable.

---

### 2.3 Classification Confidence System

Two distinct confidence concepts that must never be conflated:

**Sample Confidence** — is there enough data to trust this finding?
Reuses `sampleConfidence(n)` from `entryRegistry.js` exactly as-is:
- `INSUFFICIENT` (< 10 trades)
- `LOW N` (10–29 trades)
- `MODERATE N` (30–49 trades)
- `ROBUST` (50+ trades)

**Classification Confidence** — how confidently does this trade belong to this archetype?
New concept, owned by `archetypeClassifier.js`. Computed per trade, not per cohort.

Classification confidence is based on the number of matching archetype criteria vs the total criteria for that archetype. A rule-based classifier with 5 criteria per archetype scores each trade:

- **HIGH** — 5/5 criteria match. Clear member.
- **MEDIUM** — 4/5 criteria match. Likely member.
- **LOW** — 3/5 criteria match. Probable member. Include with caveat.
- **BORDERLINE** — 2/5 criteria match. Ambiguous. Flag for manual review.
- **UNCLASSIFIED** — < 2 criteria match. Does not fit any archetype.

Borderline and Unclassified trades are a research signal. A high % of borderline trades means either the archetype taxonomy needs refinement or the dataset has novel failure modes not yet captured.

When ML clustering is implemented (AI tier), classification confidence becomes the cosine similarity or Euclidean distance from the cluster centroid, normalised to 0–1. The display system stays the same; only the computation changes.

---

### 2.4 Failure Severity Scoring (`severityScorer.js`)

Pure function: `scoreSeverity(trade, allTrades) → { score: 0–10, components: {...} }`

Severity is a composite of four components:

**1. Magnitude (0–4 points)**
- 0–4 pts proportional to `|r|` on a log scale. A -1R loss scores 1.2 pts; a -3R loss scores 3.6 pts.

**2. Streak Contribution (0–2 points)**
- +1 pt if this loss was part of a streak of 3+
- +2 pts if this loss extended a streak of 5+

**3. Drawdown Contribution (0–2 points)**
- Measured as this trade's R loss as a % of the session/period max drawdown.
- A trade contributing >25% of max drawdown scores 2 pts.

**4. Structural Damage (0–2 points)**
- +1 pt if archetype is Hard Invalidation (full structural failure, not just stop)
- +1 pt if classification confidence is HIGH (confirmed failure, not ambiguous)

Severity buckets for display:
- **CRITICAL** — Score 8–10 (deep red)
- **HIGH** — Score 6–7.9 (orange)
- **MODERATE** — Score 4–5.9 (amber)
- **LOW** — Score 0–3.9 (muted)

Severity scores appear as chips in: Drilldown table, DNA cards (avg severity), Replay mode cards, Prevention Engine (weight recommendations by severity-caught, not just count-caught).

---

## 3. Module-by-Module Design

---

### MODULE 01 — Overview & Landscape

**Purpose:** First landing view. Answers "how bad is my failure problem and what is its shape?"

**Components:**

**FailureKPIStrip** — 8 headline chips in a responsive grid:
- Total Losses (count + % of all trades)
- Loss Rate (%)
- Avg Loss (R, coloured red)
- Worst Loss (R)
- Severity-Weighted Failure Rate (distinct from simple count rate)
- False Loser % (if `post_stop_continuation_r` is available)
- Top Archetype (most common + its %)
- Longest Losing Streak (N consecutive)

**FailureEquityImpact** — `EquityCurveV2` wired to the full trade set. Losers rendered as coloured dots on the curve, each dot coloured by archetype. The researcher can immediately see whether drawdown clusters correspond to one archetype or many. Toggle to show severity overlay (dot size = severity score).

**ArchetypeDistributionSummary** — Two views toggleable:
- Treemap: archetype families as outer rectangles, specific archetypes as inner. Size = trade count. Colour = avg severity.
- Donut: simple proportional split with legend.

**OverviewNavCards** — A grid of 6–8 module cards, each showing the most relevant metric for that module and a "→ Explore" link. Functions as a "where should I look first?" navigator. Examples:
- "Pre-Entry Forensics: 3 high-confidence risk factors detected"
- "Temporal: Monday 08:00 failure rate is 2.4× baseline"
- "False Losers: 18% of losses may be stop raids (requires exporter upgrade)"

---

### MODULE 02 — Failure DNA & Archetypes

**Purpose:** The archetype taxonomy, identity cards, and classification system. The intellectual heart of the lab.

**Archetype Taxonomy (Initial Definition)**

Archetypes are defined in `failuresRegistry.js` as structured objects with classification criteria, display tokens, and suggested hypothesis templates.

**Tier 1 — Core Archetypes (always computed, no new fields needed):**

| Archetype | Key Signal | Classification Criteria |
|---|---|---|
| Fast Stopout | Duration < 30 mins (or < 5 candles) | `trade_duration_mins < 30 AND mfe < 0.1R` |
| Slow Bleed | Duration > 4 hrs, no meaningful MFE | `trade_duration_mins > 240 AND mfe < 0.5R AND mae > 0.5R` |
| Hope Trap | MFE > 1R before reversal to stop | `mfe > 1.0 AND outcome = Loss` |
| Hard Invalidation | Full OB breach | `ob_fully_breached = true OR max_ob_penetration_pct >= 100` |
| Close-Confirmed Invalidation | Close-confirmed breach | `close_confirmed_ob_breach = true` |

**Tier 2 — Extended Archetypes (require new fields):**

| Archetype | Key Signal | Required Fields |
|---|---|---|
| Stop Raid | Stop hit, price reversed within N candles | `post_stop_continuation_r`, `post_stop_reversal_candles` |
| News Nuke | Exit near/during high-impact event | `news_minutes_offset` |
| Drift Reversal | Long slow decline from entry, no single push | `mae` profile (gradual, not spike) |
| Fake Breakout | Entry post-BOS, immediate reversal | `structure = BOS AND fast_failure` |
| Same-Candle Failure | Stop hit on the entry candle itself | `candles_to_exit = 1` |
| HTF Counter-Trend | Entry against HTF context | `htf_context = counter` |
| Aged OB Failure | OB old at time of fill | `ob_age_candles > threshold` |
| Thin OB Failure | OB ATR ratio below threshold | `ob_atr_ratio < threshold` |

**Archetype Registry Object Structure:**
```
{
  id: "hope_trap",
  label: "Hope Trap",
  description: "Trade ran in favour (MFE ≥ 1R) before reversing to stop",
  tier: 1,
  colour: "hsl(var(--warning))",        // amber — visual token
  icon: "TrendingDown",                  // lucide icon name
  criteria: [                            // classification rules (AND by default)
    { field: "mfe",     op: "gte", value: 1.0 },
    { field: "outcome", op: "eq",  value: "Loss" },
  ],
  requiredFields: ["mfe"],
  severityWeight: 1.2,                   // multiplier vs base severity
  suggestedHypotheses: [
    "Test break-even stop at +1R",
    "Test partial exit at +1R",
    "Investigate session concentration of hope traps",
  ],
}
```

**FailureDNACard** — The rich identity card for a single archetype. Renders as a full panel (not a chip) with:

*Header row:* Archetype name, icon, colour accent strip, trade count badge, sample confidence badge, classification confidence distribution (% HIGH / MED / LOW / BORDERLINE).

*Core metrics grid:*
- Trade count + % of all losses
- Avg R loss (magnitude)
- Worst R loss
- Avg severity score
- Avg duration (if `minutes_to_exit` available)
- Avg MAE (if `mae` available) — how far against
- Avg MFE (if `mfe` available) — how far before reversal
- False loser % within this archetype

*Composition breakdown:*
- Long/short skew (% long vs % short, shown as a horizontal split bar)
- Session concentration (session pills sized by %)
- Structure split (BOS vs CHoCH %)
- Common OB characteristics (avg width, avg age if available, avg ATR ratio if available)

*Fingerprint Radar:* Hexagonal radar with six axes — timing risk, news risk, directional bias, session concentration, OB quality, pre-entry context. Each axis normalised 0–1 relative to the worst-scoring archetype. Rendered using Recharts `RadarChart`.

*Suggested Hypotheses:* 2–4 hypothesis candidates derived from the archetype definition, rendered as clickable cards. Each has a "→ Add to HypothesisLab" button. Pre-populates HypothesisLab's hypothesis form with title, rationale, and suggested SIM_FILTERS.

*Mini R distribution:* Sparkline bar chart of the R outcome frequency for this archetype (-3R to 0). Shows how the loss magnitude distributes within the type.

**ArchetypeMatrix** — A 2D matrix view. Rows = archetypes. Columns = dimensions (session, direction, structure, day of week, OB width bucket). Each cell shows the failure rate for that archetype×dimension intersection. Heatmap-coloured by failure concentration. Allows rapid identification of "Hope Trap losses are 70% London, 80% Long."

**ClassificationConfidence Panel** — For each archetype, a stacked bar showing HIGH / MED / LOW / BORDERLINE / UNCLASSIFIED distribution. A high BORDERLINE bar is a warning that the archetype definition may need refinement. Clicking a confidence segment filters the Drilldown table to those specific trades.

---

### MODULE 03 — False Loser Intelligence

**Purpose:** Separate genuine strategy failures from classification errors. Produces "true" strategy metrics with false losers removed.

**Philosophy:** A false loser is a trade the strategy labelled as a loss that was not a failure of the strategy thesis. Including them in failure analysis corrupts the archetype distribution and overstates the strategy's real problem.

**Five False Loser Types (from `falseLosers.js`):**

**Type 1: Stop Raid**
*Signal:* `post_stop_continuation_r` < 0.15 AND `post_stop_reversal_candles` < 10.
*Logic:* Price barely moved past stop before reversing. The OB structure was valid; the stop was hunted.
*Requires:* `post_stop_continuation_r`, `post_stop_reversal_candles`

**Type 2: Cost-Driven**
*Signal:* `(spread + slippage) / ob_width_pips` > 0.4 AND `|r|` < 0.15R above the breakeven threshold.
*Logic:* The loss was mathematically driven by execution costs eating into an undersized stop. The structure was not the cause of failure.
*Requires:* config fields `spread`, `slippage`, `commission` + `ob_width`

**Type 3: Retest Winner**
*Signal:* `ob_retest_n` > 1 AND there exists a subsequent trade on the same OB with `outcome = Win`.
*Logic:* The OB was not dead — it was early. The original entry timing was wrong, not the zone.
*Requires:* `ob_retest_n`, cross-trade join on OB ID

**Type 4: Directional Winner**
*Signal:* `post_stop_continuation_r` < 0.5 AND price subsequently moved in the original direction by > `tp` distance (from a different zone).
*Logic:* The directional read was correct but the execution vehicle (this OB) was wrong.
*Requires:* `post_stop_continuation_r`, `directional_continuation_flag` (new field)

**Type 5: Timing False Loser**
*Signal:* MAE occurred predominantly in the first 2 candles (fill was poorly timed, OB had not yet been tested cleanly), and MFE > 1R was reached later in the session from a nearby zone.
*Logic:* Entry was too early. Not an OB failure — a timing failure.
*Requires:* `mfe`, `mae`, `candles_to_exit`, `candles_to_peak_mfe`

**TrueMetricsPanel** — After false losers are identified, this panel shows:
- Baseline metrics (all trades)
- True metrics (false losers reclassified as neutral / removed)
- Delta: the real improvement in WR, expectancy, PF when false losers are excluded
- A warning: "True metrics assume all identified false losers are correctly classified. Review in Replay Mode before drawing conclusions."

---

### MODULE 04 — Cohort Comparison Engine

**Purpose:** Arbitrary A vs B comparison of failure cohorts. The most analytically flexible module in the lab.

**CohortBuilder** — Two side-by-side filter panels, each producing a named cohort. Presets are available:

| Preset | Cohort A | Cohort B |
|---|---|---|
| Direction | Long losses | Short losses |
| Session | London losses | New York losses |
| Sweep | Sweep present losses | No sweep losses |
| OB Age | OB age 0–7d losses | OB age 14d+ losses |
| HTF | HTF aligned losses | HTF counter losses |
| Premium/Discount | Premium entry losses | Discount entry losses |
| News | Within 30m of news | Clean window losses |
| Structure | BOS failures | CHoCH failures |
| Custom | User-defined | User-defined |

**CohortMetricsTable** — Side-by-side metrics comparison with a delta column:

| Metric | Cohort A | Cohort B | Δ |
|---|---|---|---|
| Count | N | N | — |
| % of all losses | % | % | Δpp |
| Avg R loss | R | R | ΔR |
| Avg severity | 0–10 | 0–10 | Δ |
| Avg MAE | R | R | ΔR |
| Avg MFE | R | R | ΔR |
| Avg duration | min | min | Δmin |
| Top archetype | name | name | — |
| False loser % | % | % | Δpp |

Delta column uses colour: green if B is better than A, red if worse.

**CohortArchetypeCompare** — Stacked bar chart, one bar per cohort. Each segment = archetype, colour-coded. Instantly reveals "London losses are dominated by Hope Traps; NY losses are dominated by Fast Stopouts."

**CohortScatterOverlay** — MAE/MFE scatter with two overlaid cohorts (different dot colours). Shows whether one cohort has systematically worse excursion behaviour.

**CohortTemporalCompare** — Side-by-side hour-of-day failure rate bar charts for both cohorts. Reveals whether two cohorts cluster at different times.

**Interpretation Panel** — Below all comparisons, a rule-based "Findings" panel highlights statistically notable differences between the cohorts. Example: "Cohort B (NY losses) has 2.4× the avg MAE of Cohort A (London losses), suggesting NY losses are more structurally severe. Sample sizes: A=28 (MODERATE N), B=19 (LOW N)."

---

### MODULE 05 — Temporal & Regime Analysis

**Purpose:** When do failures cluster, and is the failure pattern changing over time?

**TemporalHeatmap** — Weekday (rows) × UTC hour (cols) heatmap. Each cell shows:
- Primary mode: failure RATE (% of trades in that cell that are losses), not raw count
- Secondary mode: failure COUNT
- Delta mode: failure rate minus win rate — reveals which windows are genuinely toxic vs just high-activity

This is distinct from ProtectionLab's heatmap, which shows counts grouped by session origin. This heatmap is about fill timing.

**SeasonalPatterns** — Three views:
- Monthly bar chart: failure rate by calendar month (Jan–Dec). Annotated with known seasonal events (summer lull, Christmas).
- Quarterly view: Q1–Q4 comparison.
- Year-over-year view: if data spans multiple years, compare equivalent months.

**FailureRegimeMonitor** — The rolling window watchdog.

Computes three rolling windows (20-trade, 50-trade, 100-trade) across the ordered trade sequence. For each window, calculates:
- Failure rate (% losses)
- Dominant archetype
- Avg MAE
- Avg duration
- Archetype Shannon entropy (is the mix becoming more concentrated?)

Compares each window to the long-run baseline. If deviation > 1.5 SD: amber alert. > 2.5 SD: red alert.

Alert examples:
- "Fast Stopout rate: +47% above baseline in last 20 trades"
- "Avg MAE: +0.28R above baseline in last 50 trades (possible stop sizing issue)"
- "News Nuke % has increased from 8% → 22% in the last 30 trades"

Renders as a timeline chart with regime zones colour-banded (normal / elevated / alert).

**WhatChangedComparison** — Period A vs Period B split analysis. User selects a split point (date picker or trade index slider). Full metrics table with delta column, archetype distribution comparison, and an auto-generated "Key Changes" panel highlighting the three largest deltas. Designed to answer "why did my strategy start degrading in March?"

**RegimeEquityOverlay** — The equity curve with regime zone bands overlaid as coloured background regions. Each regime zone labelled with its dominant archetype. A researcher can immediately see "this drawdown cluster was entirely News Nuke losses during the [Elevated] regime."

---

### MODULE 06 — Pre-Entry Forensics

**Purpose:** What was true before the trade was entered that predicted failure?

**ConditionScorecard** — A ranked table of pre-entry conditions, each with:
- Condition name (e.g. "HTF Counter-Trend")
- % of losing trades that had this condition
- % of winning trades that had this condition
- Lift ratio (loss% / win% — a ratio > 2.0 is a strong failure predictor)
- Sample N
- Confidence tier

Conditions are sorted by lift ratio. High lift ratios are highlighted. A condition with lift 3.0 means trades with that condition fail 3× more often than trades without it.

**Condition panels (one per pre-entry factor):**
Each panel shows the same structure: a failure rate comparison chart (with vs without the condition), sample confidence badge, and a "→ Suggest Hypothesis" button.

| Panel | Required Field | Derivable? |
|---|---|---|
| HTF Context | `htf_context` | No — exporter |
| Sweep Presence | `sweep_present` | No — exporter |
| Displacement Strength | `displacement_strength` | No — exporter |
| Opposing Liquidity | `opposing_ob_distance_pips` | No — exporter |
| Premium / Discount | `premium_discount` | No — exporter |
| Overextension | `pips_from_swing` | No — exporter |
| Fill Depth | `fill_depth_pct` | No — exporter |
| OB Age | `ob_age_candles` | No — exporter |
| OB ATR Ratio | `ob_atr_ratio` | No — exporter |
| OB Width | `ob_width` | **Yes — existing field** |
| Direction | `direction` | **Yes — existing field** |
| Session | `session` | **Yes — existing field** |
| Structure Type | `structure` | **Yes — existing field** |
| Day of Week | Derived from `entry` | **Yes — derivable** |

Panels for unavailable fields render in a "data required" state with a clear exporter upgrade prompt. They do not block the module.

---

### MODULE 07 — Excursion Science

**Purpose:** How did failing trades actually move? Stop raids vs genuine failures. Stop efficiency. Partial opportunity.

**MAEMFEScatter** — The anchor chart of the entire lab.
- X-axis: MFE (0 to +3R, rightward) — how far the trade ran in favour
- Y-axis: MAE (0 to -3R, downward) — how far against
- Each dot = one losing trade, coloured by archetype
- Quadrant labels: "Never moved right" (low MFE, high MAE), "Hope trap" (high MFE, high MAE), "Immediate stop" (low MFE, low MAE — fast stopouts), "Near miss" (low MFE, modest MAE)
- Hover tooltip: trade ID, archetype, R, session, direction, MFE, MAE
- Filter controls: by archetype (toggle dots on/off), by cohort A/B

**ReversalBeforeFailure** — Histogram showing the MFE bucket distribution for losers:
- Buckets: never moved (MFE < 0.05R), 0.05–0.25R, 0.25–0.5R, 0.5–1R, 1–1.5R, 1.5–2R, 2R+
- The inflection point bucket (highest count) is highlighted and annotated: "The majority of your hope traps turned at 1.0–1.5R. A break-even stop at +1R would have protected N of these."
- Directly feeds the Prevention Engine's BE stop recommendation

**PostStopContinuation** — Histogram showing how far price continued past the stop:
- Buckets: 0–5%, 5–10%, 10–25%, 25–50%, 50–100%, 100–150%, 150–200%, 200%+
- (Expressed as % of OB width past the stop, not pips — normalised)
- A spike in the 0–10% bucket signals stop raids dominate. A flat/right-skewed distribution signals genuine structural failures.
- Annotated: "X% of losses had less than 10% continuation — potential stop raids. See False Loser module."

**StopEfficiency** — Scatter plot: X = stop distance in pips. Y = post-stop continuation in pips. Trades clustered in the upper-left (small stop, large continuation) are efficiently stopped — structure genuinely failed. Trades in the lower-left (small stop, small continuation) are stop raid candidates. Trades in the upper-right (large stop, large continuation) may have undersized stops relative to the move that failed them.

**PartialRecoveryRate** — "After the stop was hit, what % of trades recovered to BE within N candles?" Rendered as a single metric chip (with supporting context) gated behind `post_stop_be_recovery_candles`. If 30% of losing trades recovered to BE within 10 candles, a trailing mechanism might have saved them.

---

### MODULE 08 — Directional Asymmetry

**Purpose:** Do longs and shorts fail differently? This research is often the most commercially impactful.

**DirectionMetricsCompare** — Paired horizontal bar chart. One row per metric. Two bars per row: Long (blue/teal) and Short (red/coral), diverging from centre.

Metrics displayed:
- Win Rate
- Expectancy (R)
- Profit Factor
- Avg MAE
- Avg MFE
- Avg Loss Magnitude
- Avg Duration of losses
- Top archetype for each direction

**DirectionArchetypeBreakdown** — Side-by-side archetype distributions for Long vs Short losses. Do Hope Traps cluster more in longs? Do Hard Invalidations cluster more in shorts?

**TailRiskByDirection** — Left-tail analysis (worst outcomes). For each direction: worst 5 individual trades, CVaR (avg of worst 10%), max consecutive losses. This is funded account risk analysis.

**DirectionTPOptimiser** — If longs fail more but have higher MFE before failure, the optimal TP target for longs may be lower than the configured RR. Renders a sensitivity chart: X = hypothetical TP in R, Y = projected WR (estimated from MFE distribution). Shows the crossover point where a lower TP would have improved WR significantly. Gated behind `mfe`. Feeds directly into a TP research hypothesis.

---

### MODULE 09 — Session Analysis

**Purpose:** Session-specific failure rates and the origin-vs-fill session matrix.

**SessionFailureRates** — Bar chart: one bar per session (Asia, London, London Lull, New York, Outside), showing failure rate (not count). Severity-weighted failure rate shown as a secondary bar (dimmer, overlaid). Archetype tooltip on hover: "65% of London failures are Hope Traps."

**OriginFillSessionMatrix** — A grid: rows = OB origin session, columns = fill session. Each cell = failure rate for that origin×fill combination. Highlights pathological combinations: "OBs created in Asia and filled in New York have a 71% failure rate." This is the most analytically novel view in the session module.

**SessionArchetypeBreakdown** — Stacked bar: one bar per session, segments = archetype %. Reveals whether different sessions fail in structurally different ways.

---

### MODULE 10 — News Failure Analysis

**Purpose:** News-specific failure cuts, designed as a thin intelligence layer that links to NewsLab for the heavy analytics.

**NewsProximityGradient** — X-axis: time offset from nearest news event (T-60m, T-30m, T-15m, T-5m, T±0, T+5m, T+15m, T+30m, T+60m, T+120m+). Y-axis: failure rate. Shows whether failure rate spikes before news (anticipation), at news (impact), or after (continuation). Gated behind `news_minutes_offset`.

**NewsArchetypeInteraction** — A 2D view: which archetypes are disproportionately news-proximate? If 80% of News Nuke losses are within 15 mins of red-impact USD events, that is a precise exclusion rule. Cross-links to NewsLab with a "→ Full news analysis" button.

---

### MODULE 11 — Failure Replay Mode

**Purpose:** Rapid, structured review of classified failures for visual pattern recognition and manual reclassification. The research equivalent of a film review session.

**Philosophy:** The replay mode exists because data tables are bad for pattern recognition. Showing trades one at a time, richly formatted, with classification context visible, enables a researcher to develop intuitive understanding of archetype membership that no chart can provide.

**ReplayCard** — A single-trade display card containing:
- Trade ID, timestamp, direction badge, session pill, structure pill
- R outcome (large, coloured)
- Archetype pill + classification confidence pill
- Severity score chip
- MAE bar (red, leftward) and MFE bar (teal, rightward), scaled to 3R
- Trade duration
- False loser flag (if detected)
- Manual tag status (if previously overridden)
- OB characteristics (width, age if available)
- Pre-entry flags (HTF context, sweep, displacement — if available)

**ReplayNavigation** — Progress indicator "12 of 47 · Hope Traps", keyboard shortcuts (← → for navigation, T to tag, S to skip, B to bookmark), speed control (auto-advance on timer for rapid review), current cohort filter active.

**ReplayFilters** — Filter replayed trades by:
- Archetype (focus review on one type at a time)
- Classification confidence (show only BORDERLINE for prioritised review)
- Manual tag status (show only untagged)
- Date range
- Severity threshold

**ReplayTagOverride** — Inline in the ReplayCard: an action menu with:
- "Confirm archetype" (mark as reviewed, HIGH confidence)
- "Override to..." (archetype picker)
- "Mark as False Loser"
- "Add note" (free text, stored with trade ID)
- "Bookmark for later"

Keyboard shortcut: pressing the first letter of an archetype's name while reviewing triggers the override. For example, "H" → Hope Trap, "F" → Fast Stopout.

---

### MODULE 12 — Streaks & Sequence Analysis

**Purpose:** Is the loss pattern random or structured? This question has fundamentally different implications for strategy remediation.

**ConsecutiveLossPanel** — Max consecutive losses, run-length distribution histogram (1 loss, 2 consecutive, 3, 4, 5+), and the timeline dot-strip chart showing the W/L sequence visually.

**RunsTestPanel** — Wald-Wolfowitz runs test.
- Computes the number of "runs" (contiguous sequences of W or L) in the ordered trade sequence.
- Compares to the expected number under a random null hypothesis.
- Output: Z-statistic, p-value, plain-language verdict: "Your losses are **not statistically random** (p=0.03). They cluster more than chance predicts, suggesting regime-driven failure." OR "Your losses are **consistent with random distribution** (p=0.31). Variance, not regime, is the likely cause."
- This is the most statistically credible output in the entire platform. It should be prominently displayed.

**SequenceDependency** — Conditional probability matrix. Does failing on trade N make trade N+1 more likely to fail?

| Prior Trade | Win | Loss |
|---|---|---|
| P(next = Loss \| prior = Win) | — | X% |
| P(next = Loss \| prior = Loss) | — | Y% |

If Y >> X, losses are sequentially dependent (contagion). If Y ≈ X, failures are independent. Archetype-specific conditioning: "After a Hope Trap loss, what is the P(next = Hope Trap)?"

**StreakEquityOverlay** — Equity curve with streak zones highlighted. Each consecutive-loss streak shown as a coloured band. Duration, depth, and dominant archetype per streak labelled.

---

### MODULE 13 — Prevention Engine

**Purpose:** Translate failure intelligence into ranked, actionable exclusion recommendations. The engine that closes the research loop between Failures Lab and HypothesisLab.

**Philosophy:** Every recommendation must show both sides of the trade-off: losers eliminated AND winners eliminated. A rule that eliminates all losses but also eliminates all wins is worthless. The goal is maximum loser catch rate with minimum false positives.

**FilterRecommendations** — The ranked recommendation list. Computed by `preventionEngine.js` from the active trade set.

Each recommendation card contains:
- Rule description (plain language): "Exclude Long entries during London session on Mondays"
- Filter expression (machine-readable, compatible with HypothesisLab SIM_FILTERS format)
- Losers caught: N trades, X% of all losses
- Winners removed: N trades, Y% of all winners — **this is the critical number**
- Estimated net R delta: +/- Z R
- Affected archetype(s): which archetype does this rule primarily target?
- Confidence tier based on sample N
- Severity-weighted catch rate (counts losses by severity, not just count)
- "→ Add to HypothesisLab" button (pre-populates hypothesis form)
- "→ Simulate in Drilldown" button (filters Drilldown to caught trades for review)

**Sorting options:** by net R delta / by loser catch rate / by false positive rate / by confidence.

**WouldThisHaveHelped** — Scoped to the active cohort. Given the currently filtered failure cohort, test a library of 30+ candidate exclusion rules and rank them by: "what % of THIS cohort would this rule have caught?"

This is the inverse of FilterRecommendations. FilterRecommendations works on all trades. WouldThisHaveHelped works on a specific cohort the researcher has identified as interesting (e.g. "all Hope Trap losses in London").

Output: ranked table, same structure as FilterRecommendations.

**CombinedFilterAnalysis** — The compound rule builder. Researcher selects 2–5 rules from the recommendation list. The engine computes the combined effect: losers caught by the combination, winners removed by the combination, combined net R delta, overlap analysis (how many losers are caught by multiple rules vs unique catches).

This prevents double-counting false confidence: if two rules both catch the same 10 trades, combining them adds no value. The engine shows the marginal gain of each additional rule.

**PreventionHypothesisExport** — A "Generate Hypothesis Batch" button. Takes all accepted recommendations (those the researcher has starred/accepted) and writes them as hypothesis cards directly to the HypothesisLab localStorage (`fxob_entry_hypotheses_v1`). One-click research-to-test pipeline.

---

### MODULE 14 — Cross-Run Comparison

**Purpose:** Compare failure archetype distributions across 2–5 imported runs to identify universal vs run-specific failure modes.

**Run selector:** Multi-select from all loaded runs. Up to 5 runs.

**CrossRunArchetypeMatrix** — Rows = archetypes. Columns = selected runs. Each cell: failure rate for that archetype in that run. Colour-coded by intensity. Allows immediate identification of: "Fast Stopout is elevated in all 5 runs" (universal problem) vs "News Nuke only appears in EURUSD M15" (symbol-specific).

**CrossRunMetricsTable** — Full failure metrics per run in a comparison table. Columns: Run ID, symbol, TF, overall failure rate, top archetype, avg MAE, avg severity, false loser %, longest streak.

**SharedVsRunSpecific** — A Venn-style analysis. Which archetypes appear in all runs (universal — strategy-level problem)? Which appear in only one run (run-specific — possibly symbol/TF noise)? The distinction matters enormously for exclusion rule portability.

**Insight panel:** Auto-generated observations:
- "Hard Invalidation is elevated across all 3 long runs — this may be a stop sizing issue, not a session issue."
- "News Nuke only appears in EURUSD M15, where 4 CPI events occurred in the dataset period. This is likely statistical noise."

---

### MODULE 15 — Failure Drilldown

**Purpose:** Deep individual trade inspection. The researcher's forensic desk.

**FailureTradeTable** — Sortable, filterable DataTable of all losing trades. Columns:

| Column | Value | Notes |
|---|---|---|
| ID | T-001 | Clickable → opens detail panel |
| Date | YYYY-MM-DD HH:mm | |
| Dir | Long / Short | Pill |
| Session | London | Pill |
| Structure | BOS / CHoCH | Pill |
| Archetype | Hope Trap | Coloured pill |
| Confidence | HIGH / MED / LOW / BORDERLINE | Pill |
| Severity | 7.2 | Coloured chip |
| R | -1.4 | Red number |
| MAE | -1.1R | If available |
| MFE | +2.2R | If available |
| Duration | 4h 32m | If available |
| False Loser | ⚑ | If detected |
| Tagged | ✎ | If manually overridden |

Sort by any column. Filter by archetype, confidence, severity, false loser flag, manual tag status.

**FailureTradeDetail** — Sliding panel (right-side drawer, not a new route) showing full forensic detail for the selected trade:
- All field values
- Archetype classification breakdown (which criteria matched / didn't match)
- Classification confidence explanation ("4/5 criteria matched: duration=✓, MFE=✓, MAE=✓, session=✓, structure=✗")
- False loser analysis (each type checked, result shown)
- Severity score breakdown (magnitude + streak + drawdown + structural components)
- Pre-entry flags (all available fields shown with availability status)
- Manual tag panel (override archetype, add note)
- Cross-link buttons: "→ Trade Inspector", "→ View OB in Order Block Lab"

**FailureTimeline** — For trades with sufficient data: a horizontal lifecycle visualisation.
- X-axis: time from fill to exit
- Key events plotted as vertical markers: Fill, MFE Peak, MAE Trough, Exit (Stop)
- Zones: "In Favour" (green tint), "Against" (red tint)
- Annotations: "Reversed at +1.8R after 2h 15m. Hit stop at -1.0R after 4h 32m."
- Gated behind `mfe`, `mae`, `minutes_to_exit`

---

### MODULE 16 — Views & Export

**Purpose:** Persistence, research continuity, and data portability.

**SavedForensicViews** — Each saved view captures:
- View name (user-defined)
- Active module tab
- Cohort filter state (serialised)
- Comparison mode A/B state
- Notes (free text, markdown supported)
- Created timestamp
- Last accessed timestamp

20-view limit. Oldest automatically archived (not deleted) when limit reached.

**ViewManager** — The view management UI:
- View list with name, module label, creation date, notes preview
- Pin up to 5 views to the workspace header for one-click access
- Duplicate a view (start from existing configuration)
- Export views as JSON (share the research configuration between sessions or users)
- Import views from JSON

**ExportSystem** — Three export modes:

**CSV Export:**
- All losing trades, or active cohort
- Columns: all available fields + derived fields (archetype, confidence, severity, false loser type, manual tag)
- Column selector: choose which fields to include
- Named presets: "Full forensic export", "Archetype summary", "Prevention candidates"

**Report Export:**
- Structured markdown summary per archetype: count, key metrics, top conditions, suggested hypotheses
- Platform-level summary: overall failure rate, top archetypes, key findings from regime monitor, ranked prevention recommendations
- Note: "If the PDF skill is available, route through it. Otherwise render as markdown."

**JSON Export:**
- Full machine-readable representation including archetype registry, classified trades, cohort states, manual tags, saved views
- Intended for: Python analysis, external review, session handoff

---

## 4. Feature Ownership Matrix

| Feature | Module | Owner Component | Analytics File |
|---|---|---|---|
| Archetype classification | 02 | `archetypeClassifier.js` | `failuresRegistry.js` |
| Classification confidence | 02, 15 | `ClassificationConfidence.jsx` | `archetypeClassifier.js` |
| Failure DNA cards | 02 | `FailureDNACard.jsx` | `failuresAnalytics.js` |
| Fingerprint radar | 02 | `FingerprintRadar.jsx` | `failuresAnalytics.js` |
| False loser detection | 03 | `falseLosers.js` | `falseLosers.js` |
| True metrics | 03 | `TrueMetricsPanel.jsx` | `falseLosers.js` |
| Cohort builder | 04 | `CohortBuilder.jsx` | `cohortEngine.js` |
| Cohort compare | 04 | `CohortMetricsTable.jsx` | `cohortEngine.js` |
| Regime monitor | 05 | `FailureRegimeMonitor.jsx` | `regimeDetector.js` |
| What changed | 05 | `WhatChangedComparison.jsx` | `regimeDetector.js` |
| Condition scorecard | 06 | `ConditionScorecard.jsx` | `failuresAnalytics.js` |
| MAE/MFE scatter | 07 | `MAEMFEScatter.jsx` | `failuresAnalytics.js` |
| Stop efficiency | 07 | `StopEfficiency.jsx` | `failuresAnalytics.js` |
| Direction asymmetry | 08 | `DirectionMetricsCompare.jsx` | `failuresAnalytics.js` |
| TP optimiser | 08 | `DirectionTPOptimiser.jsx` | `failuresAnalytics.js` |
| Session matrix | 09 | `OriginFillSessionMatrix.jsx` | `failuresAnalytics.js` |
| News gradient | 10 | `NewsProximityGradient.jsx` | `failuresAnalytics.js` |
| Replay mode | 11 | `FailureReplay.jsx` | — |
| Manual tag | 11, 15 | `ReplayTagOverride.jsx`, `ManualTagPanel.jsx` | — |
| Runs test | 12 | `RunsTestPanel.jsx` | `failuresAnalytics.js` |
| Sequence dependency | 12 | `SequenceDependency.jsx` | `failuresAnalytics.js` |
| Prevention engine | 13 | `FilterRecommendations.jsx` | `preventionEngine.js` |
| Would this have helped | 13 | `WouldThisHaveHelped.jsx` | `preventionEngine.js` |
| Cross-run comparison | 14 | `CrossRunArchetypeMatrix.jsx` | `cohortEngine.js` |
| Failure timeline | 15 | `FailureTimeline.jsx` | — |
| Severity scoring | global | `severityScorer.js` | `severityScorer.js` |
| Saved views | 16 | `SavedForensicViews.jsx` | — |
| Export system | 16 | `ExportSystem.jsx` | `failuresExporter.js` |

---

## 5. Data Dependencies & Exporter Requirements

### 5.1 Tier 0 — Available Now, Zero Exporter Changes

All features in this tier are implementable immediately.

| Field | Source | Used by |
|---|---|---|
| `outcome` | trades CSV | All modules |
| `r` | trades CSV | All modules |
| `direction` | trades CSV | Module 08, cohort engine |
| `session` | trades CSV | Module 09, global filter |
| `structure` | trades CSV | Global filter, pre-entry |
| `ob_width` | trades CSV | DNA cards, condition scorecard |
| `entry` (timestamp) | trades CSV | Temporal module, derived fields |
| `exit` (timestamp) | trades CSV | Duration (derived) |
| `id` | trades CSV | All drilldown |
| `spread`, `slip`, `comm` | config | Cost-driven false loser |

**Derived from Tier 0 (no new fields):**
- `is_loser` — `outcome === 'Loss'`
- `trade_duration_mins` — `(exit - entry) in ms / 60000`
- `entry_hour`, `entry_weekday`, `entry_month`, `entry_quarter` — parse `entry`
- `cost_ratio` — `(spread + slip) / ob_width`
- `consecutive_loser_n` — computed from ordered sequence
- Wald-Wolfowitz Z-statistic and p-value — pure statistics
- Rolling window metrics — computed from ordered sequence

### 5.2 Tier 1 — Critical Priority (unlock 60% of lab value)

| Field | Type | Description | Impact |
|---|---|---|---|
| `mae` | float (R) | Maximum Adverse Excursion | MAE/MFE scatter, DNA cards, stop efficiency |
| `mfe` | float (R) | Maximum Favorable Excursion | Reversal histogram, hope trap detection, TP optimiser |
| `minutes_to_exit` | int | Time from fill to exit | Duration analysis, fast stopout, slow bleed |
| `post_stop_continuation_r` | float (R) | Price continuation past stop | Stop raid detection, false loser type 1 |

### 5.3 Tier 2 — High Priority (unlock 25% more)

| Field | Type | Description |
|---|---|---|
| `fill_depth_pct` | float 0–100 | Entry penetration depth into OB |
| `ob_age_candles` | int | Candles since OB creation at fill |
| `htf_context` | enum | `bullish/bearish/neutral/unknown` |
| `sweep_present` | bool | Liquidity sweep before entry |
| `candles_to_exit` | int | How many candles trade was open |
| `post_stop_reversal_candles` | int | Candles until price reversed after stop |

### 5.4 Tier 3 — Medium Priority

| Field | Type | Description |
|---|---|---|
| `ob_atr_ratio` | float | OB width / ATR at creation |
| `atr_at_entry` | float | ATR at fill time |
| `opposing_ob_distance_pips` | float | Distance to nearest opposing OB |
| `ob_creation_structure` | enum | `bos/choch` at OB creation |
| `ob_retest_n` | int | Which retest (1st, 2nd…) |
| `premium_discount` | enum | `premium/discount/fair/unknown` |
| `displacement_strength` | enum | `strong/moderate/weak` |

### 5.5 Tier 4 — AI/Advanced Tier

| Field | Type | Description |
|---|---|---|
| `news_event_id` | string | FK to news event if in blackout |
| `news_minutes_offset` | int | Minutes from nearest news event |
| `candles_to_peak_mfe` | int | How many candles to reach MFE peak |
| `post_stop_be_recovery_candles` | int | Candles for price to recover to BE |
| `regime_at_entry` | enum | `trending/ranging/expansion` |
| `directional_continuation_flag` | bool | Did price continue in direction post-stop? |
| `htf_structure_age_candles` | int | Age of HTF structure at entry |

### 5.6 Exporter Upgrade Sequencing

Recommended request order:
1. **`mae` + `mfe`** — highest analytical density, smallest implementation surface
2. **`minutes_to_exit`** + **`candles_to_exit`** — enables duration-based archetypes
3. **`post_stop_continuation_r`** — unlocks false loser detection (commercially unique)
4. **`htf_context`** — may be the highest-value single field in the platform
5. **`sweep_present`** — binary flag, minimal exporter work, high research value
6. **`ob_age_candles`** — enables OB survival curve (novel, publishable)
7. **`fill_depth_pct`** — connects to EntriesLab research

---

## 6. UX Flow & Interaction Model

### 6.1 Primary Research Arc

The designed user journey through Failures Lab:

```
ENTER: Overview
  ↓ "What is my failure landscape?"
  → KPI strip → Equity impact → Archetype distribution

DISCOVER: DNA & Archetypes
  ↓ "Which archetype dominates? What does its DNA look like?"
  → DNA card grid → Fingerprint radar → Suggested hypotheses

VALIDATE: False Losers
  ↓ "Are some of these losses actually false losers?"
  → Stop raid histogram → True metrics recalculation

INVESTIGATE: Temporal / Pre-Forensics / Excursion
  ↓ "When, why, and how do they fail?"
  → Heatmaps → Condition scorecard → MAE/MFE scatter

COMPARE: Cohort Engine
  ↓ "Is long worse than short? London worse than NY?"
  → A/B cohort build → Metrics table → Archetype compare

MONITOR: Regime Monitor + What Changed
  ↓ "Is my failure pattern changing?"
  → Rolling window alerts → Period comparison

REVIEW: Replay Mode
  ↓ "Let me manually review borderline classifications"
  → Card-by-card → Tag overrides

ACT: Prevention Engine
  ↓ "What rules should I test?"
  → Ranked recommendations → → HypothesisLab
```

### 6.2 Interaction Design Principles

**Principle 1: Every finding generates an action.** Every panel that surfaces a pattern should have a path forward: "→ Create Hypothesis", "→ View in Drilldown", "→ Compare in Cohort Engine". The lab should never be a dead end.

**Principle 2: Cohort filter is always visible.** The active cohort filter bar is sticky. If the researcher scrolls within a module, the filter stays pinned below the tab rail. The researcher always knows what population they are looking at.

**Principle 3: Confidence is always visible.** Every metric, chart, and finding shows its sample confidence badge. No finding is presented without its epistemic caveat. This is the most important trust-building feature in the platform.

**Principle 4: Data quality degrades gracefully.** No module hides itself due to missing fields. Every module shows its best available analysis, clearly labelled. The data quality banner explains what is missing and why it matters.

**Principle 5: Replay mode is never more than one click away.** From any archetype's DNA card or any drilldown table row, a single click opens the replay mode pre-filtered to that set. The researcher should feel they can always "show me these trades one by one."

**Principle 6: The HypothesisLab bridge is everywhere.** Every finding that could become an exclusion hypothesis should have a "→ Add to HypothesisLab" action. This is the lab's reason for existing.

### 6.3 Keyboard Shortcuts

In Replay Mode:
- `←` / `→` — navigate trades
- `T` — open tag override menu
- `B` — bookmark current trade
- `S` — skip (mark reviewed, no tag)
- `F` — mark as false loser
- `1`–`8` — quick-assign archetype by number
- `Space` — confirm current classification

In Drilldown Table:
- `↑` / `↓` — navigate rows
- `Enter` — open trade detail panel
- `Esc` — close detail panel
- `E` — open export for current selection

### 6.4 State Persistence Map

| State | localStorage Key | Scope |
|---|---|---|
| Cohort filter | `fxob_failures_cohort_filter` | Session |
| Active module tab | `fxob_failures_active_tab` | Session |
| Saved forensic views | `fxob_failures_saved_views` | Persistent |
| Manual archetype tags | `fxob_failures_manual_tags` | Persistent |
| Replay progress | `fxob_failures_replay_progress` | Session |
| Panel collapsed states | `fxob_failures_panel_states` | Persistent |
| Comparison cohort B filter | `fxob_failures_cohort_b` | Session |
| Export presets | `fxob_failures_export_presets` | Persistent |
| Workspace notes | `fxob_failures_notes` | Persistent |

---

## 7. Visual Analytics System

### Priority 1 — Must Build

| Chart | Module | Library | Data requirement |
|---|---|---|---|
| Equity curve + archetype dot overlay | 01 | `EquityCurveV2` (existing) | Tier 0 |
| Weekday × Hour failure rate heatmap | 05 | CSS grid + DataTable heatmap mode | Tier 0 |
| MAE/MFE scatter plot | 07 | Recharts `ScatterChart` | Tier 1 (mae, mfe) |
| Post-stop continuation histogram | 07 | Recharts `BarChart` | Tier 1 |
| Reversal-before-failure histogram | 07 | Recharts `BarChart` | Tier 1 (mfe) |
| Archetype treemap | 01/02 | D3 treemap or SVG | Tier 0 |
| Fingerprint radar per archetype | 02 | Recharts `RadarChart` | Tier 0 (partial) |
| Direction diverging bar | 08 | Recharts `BarChart` | Tier 0 |
| Regime monitor timeline | 05 | Recharts `LineChart` | Tier 0 |
| W/L streak dot strip | 12 | SVG (small, custom) | Tier 0 |

### Priority 2 — High Value

| Chart | Module | Library | Data requirement |
|---|---|---|---|
| OB age survival curve | 02/06 | Recharts `LineChart` | Tier 2 (ob_age_candles) |
| Sankey: trade lifecycle flow | 01 | D3 Sankey | Tier 1 |
| Stop efficiency scatter | 07 | Recharts `ScatterChart` | Tier 1 |
| Cohort A/B MAE scatter overlay | 04 | Recharts `ScatterChart` | Tier 1 |
| Archetype × dimension heatmap matrix | 02 | CSS grid | Tier 0 |
| Regime zone equity overlay | 05 | `EquityCurveV2` with bands | Tier 0 |
| Rolling failure rate line | 05 | Recharts `LineChart` | Tier 0 |
| News proximity gradient | 10 | Recharts `BarChart` | Tier 4 |

### Priority 3 — Advanced / AI Tier

| Chart | Module | Library | Data requirement |
|---|---|---|---|
| ML cluster scatter (2D PCA) | 02 | Recharts `ScatterChart` | AI tier |
| Feature importance bar | 06 | Recharts `BarChart` | AI tier |
| Failure cohort evolution stacked area | 05 | Recharts `AreaChart` | Tier 0 + archetype |
| Direction TP optimiser curve | 08 | Recharts `LineChart` | Tier 1 (mfe) |
| Failure timeline lifecycle | 15 | SVG (custom) | Tier 1 |

---

## 8. AI Future Layer

The AI layer is designed but not implemented. All hooks are defined in `failuresRegistry.js` and flagged with `aiTier: true`. When the AI engine is activated (via Web Worker or sidecar), it replaces specific pure functions without breaking any UI components.

### AI Tier 1 — In-Browser (Web Worker)

**Auto-clustering engine** — Replace the rule-based `classify()` with k-means clustering on normalised trade vectors. Input features: duration, `mae`, `mfe`, `r`, session (encoded), direction (binary), structure (binary). Output: cluster assignments + centroid-derived archetype labels. The researcher names the clusters; the algorithm discovers them.

**Feature importance ranking** — Given all losing trades and their pre-entry features, rank features by predictive power (Gini impurity or variance reduction from a shallow decision tree). Output: "The top 3 failure predictors are: HTF counter (importance 0.31), Monday entry (0.22), OB age > 14d (0.19)." Renders as a horizontal bar chart in Pre-Entry Forensics module.

**Auto-hypothesis generation** — Scan all Prevention Engine recommendations and Condition Scorecard lift ratios. Auto-generate hypothesis cards for any finding with lift > 2.0 and MODERATE N. Format: structured hypothesis card pre-populated with title, rationale, suggested filter, and confidence note. Routes to HypothesisLab storage.

### AI Tier 2 — Enhanced Analytics

**Anomaly detection** — Trades that don't fit any archetype (UNCLASSIFIED) are scored by distance from all centroids. A high anomaly score suggests a novel failure mode. Surfaced as an alert: "4 trades are anomalies — potential new failure archetype."

**False loser confidence scoring** — Instead of binary false loser detection, produce a probability score (0–1) for each false loser type per trade. "This trade has a 0.83 probability of being a stop raid." Requires `post_stop_continuation_r` and `post_stop_reversal_candles`.

**Regime change point detection** — CUSUM or Bayesian change point detection on the rolling failure rate series. Automatically identifies the most likely date/trade index where the failure regime shifted. Surfaced in WhatChanged module as an auto-detected split point.

### AI Tier 3 — Research Automation

**Cross-symbol pattern transfer** — Given 3+ imported runs, identify which failure archetypes and pre-entry conditions transfer across symbols. Output: a "transferability score" per archetype — rules that transfer get higher priority in the Prevention Engine.

**Stop design optimiser** — Bayesian optimisation loop: given the post-stop continuation distribution, find the stop buffer that maximises P(false loser avoided) while minimising P(genuine winner affected). This is a direct product of the false loser detection system applied to stop design.

**Adaptive archetype taxonomy** — Periodically re-cluster the trade history. If the cluster structure changes significantly (e.g. a new cluster emerges), alert the researcher: "A new potential archetype has appeared in your recent data. 8 trades do not fit existing archetypes and may form a new pattern."

---

## 9. Phased Implementation Roadmap

### Phase 0 — Foundation (prerequisite, 0 new exporter fields)

Build the module shell with no analytics yet. This phase establishes the architecture and tests the workspace pattern.

- `FailuresLab.jsx` workspace shell + tab rail
- `FailuresCohortFilter.jsx` — full filter bar, cohort state management
- `FailuresDataQualityBanner.jsx` — field coverage detection
- `failuresRegistry.js` — archetype taxonomy, display tokens
- `failuresUtils.js` — loser filtering, field normalisation
- `failuresDataQuality.js` — coverage maps

**Output:** An empty but correctly structured workspace. All modules render placeholder panels with data quality status. The filter bar works.

---

### Phase 1 — Tier 0 Intelligence (no new exporter fields)

All analytics derivable from existing trade data. Delivers immediate research value.

**Module 01 — Overview:**
- `FailureKPIStrip` — 8 KPI chips
- `ArchetypeDistributionSummary` — Tier 1 archetypes only (Hard Invalidation, Fast Stopout via duration)
- `FailureEquityImpact` — wire `EquityCurveV2` with archetype dots

**Module 02 — DNA (partial):**
- `archetypeClassifier.js` — rule-based, Tier 1 archetypes
- `FailureDNACard` — all fields derivable from Tier 0
- `ArchetypeMatrix` — direction × session × structure dimensions

**Module 05 — Temporal:**
- `TemporalHeatmap` — weekday × hour (from `entry` timestamp)
- `SeasonalPatterns` — monthly/quarterly
- `FailureRegimeMonitor` — rolling window (no new fields needed)
- `WhatChangedComparison` — date-split analysis

**Module 08 — Direction:**
- `DirectionMetricsCompare` — WR, expectancy, PF from existing fields
- `DirectionArchetypeBreakdown`

**Module 09 — Sessions:**
- `SessionFailureRates`
- `OriginFillSessionMatrix`

**Module 12 — Streaks:**
- `ConsecutiveLossPanel`
- `RunsTestPanel` — Wald-Wolfowitz (pure statistics)
- `SequenceDependency`

**Module 13 — Prevention (partial):**
- `FilterRecommendations` — Tier 0 rules only (session, direction, structure, time)
- `PreventionHypothesisExport` — → HypothesisLab bridge

**Module 15 — Drilldown:**
- `FailureTradeTable` — sortable, filterable
- `ManualTagPanel` — archetype override + notes

**Module 16 — Export:**
- `ExportSystem` — CSV export (all available fields)
- `SavedForensicViews` — view persistence

**→ HypothesisLab integration:** Live from Phase 1. Every recommendation and DNA card hypothesis button writes to `fxob_entry_hypotheses_v1`.

---

### Phase 2 — Excursion Science (requires `mae`, `mfe`, `minutes_to_exit`)

**Module 02 — DNA (full):**
- `FailureDNACard` — now includes avg MAE, avg MFE, avg duration
- Full Tier 2 archetypes: Hope Trap (confirmed), Slow Bleed (confirmed), Fast Stopout (confirmed with duration)
- `FingerprintRadar` — all six axes now computable

**Module 03 — False Losers (partial):**
- `FalseLosersOverview`
- `CostDrivenAnalysis` — available from Phase 1, but now with MAE context

**Module 07 — Excursion Science (full):**
- `MAEMFEScatter`
- `ReversalBeforeFailure`
- `StopEfficiency` (partial — needs `post_stop_continuation_r` for full version)

**Module 08 — Direction (full):**
- `TailRiskByDirection` — CVaR, worst-N
- `DirectionTPOptimiser` — requires MFE

**Module 11 — Replay (Phase 2 unlock):**
- `FailureReplay` — now includes MAE/MFE bars in ReplayCard
- Keyboard shortcuts

**Module 13 — Prevention (enhanced):**
- `WouldThisHaveHelped` — now severity-weighted (requires severity scores from MAE)
- `CombinedFilterAnalysis`

---

### Phase 3 — False Loser Intelligence (requires `post_stop_continuation_r`, `post_stop_reversal_candles`)

**Module 03 — False Losers (full):**
- `StopRaidAnalysis` — stop raid detection, continuation histogram
- `RetestWinnerAnalysis` (if `ob_retest_n` available)
- `TrueMetricsPanel` — recalculated strategy metrics

**Module 07:**
- `PostStopContinuation` — full histogram
- `StopEfficiency` — complete version

**Module 02:**
- Stop Raid archetype — now classifiable with confidence
- `ClassificationConfidence` panel — now includes stop raid

**Module 15:**
- `FailureTimeline` — full lifecycle view (entry → MFE → reversal → exit)

---

### Phase 4 — Pre-Entry Forensics (requires `htf_context`, `sweep_present`, `ob_age_candles`)

**Module 06 — Pre-Entry Forensics (core):**
- `ConditionScorecard` — lift ratios for HTF, sweep, OB age
- `HTFContextPanel`
- `SweepPresencePanel`
- OB survival curve

**Module 02:**
- HTF Counter-Trend archetype, Aged OB Failure archetype — now classifiable
- DNA cards updated with OB age, ATR ratio context

**Module 13:**
- `FilterRecommendations` — expanded with HTF and sweep-based rules

---

### Phase 5 — Cohort & Cross-Run (no new fields, builds on Phase 1–4)

**Module 04 — Cohort Comparison (full):**
- All cohort preset comparisons
- `CohortScatterOverlay` requires `mae`/`mfe` (Phase 2)
- `CombinedFilterAnalysis`

**Module 14 — Cross-Run:**
- `CrossRunArchetypeMatrix`
- `CrossRunMetricsTable`
- `SharedVsRunSpecific`

---

### Phase 6 — News Layer (requires `news_minutes_offset`)

**Module 10 — News Failures:**
- `NewsProximityGradient`
- `NewsArchetypeInteraction`
- News Nuke archetype — fully classifiable

---

### Phase 7 — AI Layer (Web Worker)

- Auto-clustering replaces rule-based classifier
- Feature importance panel
- Auto-hypothesis generation
- Anomaly detection alerts
- False loser probability scoring
- Regime change point detection

---

## 10. Risk Warnings

### Risk 1: Archetype Inflation

**Problem:** Adding too many archetypes creates buckets with < 10 trades each, making every archetype INSUFFICIENT N and the entire taxonomy statistically meaningless.

**Mitigation:** Gate archetype display behind `sampleConfidence(n)` from `entryRegistry.js`. An INSUFFICIENT N archetype renders as a greyed pill in the DNA roster — visible but clearly marked as having too few trades to draw conclusions. Enforce a maximum of 8 archetypes in Tier 1/2 combined. New archetypes must be explicitly unlocked by the researcher, not automatically displayed.

### Risk 2: False Loser Over-Classification

**Problem:** Aggressive false loser detection reclassifies genuine structural failures as stop raids, falsely improving the apparent strategy metrics.

**Mitigation:** All false loser detection uses conservative thresholds (`post_stop_continuation_r < 0.15` is stricter than 0.25). `TrueMetricsPanel` shows a prominent disclaimer: "True metrics are estimates. False loser detection requires manual review in Replay Mode before conclusions can be drawn." Never auto-remove false losers from any metric calculation without explicit researcher action.

### Risk 3: Prevention Engine Over-Fitting

**Problem:** The Prevention Engine finds rules that fit historical losses perfectly but destroy forward performance by removing too many winners.

**Mitigation:** Every recommendation mandates showing the false positive rate (% of winners also removed) with equal prominence to the loser catch rate. A rule that catches 100% of losers but also catches 40% of winners should visually flag as dangerous. Add a "false positive warning" threshold: if `winners_removed_pct > 15%`, show a red warning badge on the recommendation.

### Risk 4: Regime Monitor False Alarms

**Problem:** At small sample sizes, rolling windows produce false positive regime alerts that alarm the researcher unnecessarily.

**Mitigation:** The regime monitor does not activate until the total trade history exceeds 50 trades. Rolling windows require minimum 10 trades to compute. Alert thresholds should be conservative (2.5 SD, not 1.5 SD) by default, with a researcher-configurable sensitivity control.

### Risk 5: Manual Tag Corruption

**Problem:** Bulk manual overrides corrupt the archetype distribution, and the researcher forgets they made overrides.

**Mitigation:** Manual overrides are always visually distinct (override badge). A persistent "N manual overrides active" warning appears in the data quality banner whenever overrides exist. A "Clear all overrides" option is available but requires confirmation. Override history is preserved, never silently lost.

### Risk 6: localStorage Overflow

**Problem:** The platform already has multiple localStorage keys. Failures Lab adds 8+ new keys. Manual tags for large trade sets could overflow the 4–5 MB localStorage budget.

**Mitigation:** Manual tags store only `{ tradeId, archetype, note, timestamp }` — minimal size. Saved views are capped at 20 entries with oldest auto-archived. Workspace notes are stored with a 10,000 character limit. The `failuresDataQuality.js` module should include a storage budget monitor parallel to the existing candle-drop mechanism in `store.js`.

### Risk 7: The ProtectionLab Anti-Pattern

**Problem:** ProtectionLab became a 1,778-line monolith because analysis grew into a single file. This must not happen to Failures Lab.

**Mitigation:** The file structure defined in Section 1.1 is the hard constraint. No module file should exceed 400 lines. All analytics logic lives in the `shared/` directory, never inline in JSX. Every module is independently importable with no cross-module state coupling (all state flows through the workspace shell or global filter context).

---

## 11. Commercial Product Vision

If Failures Lab were positioned as a standalone premium research product, these are the differentiated features that justify premium pricing:

**"True Win Rate" feature** — After false loser classification and removal, the platform can surface a "corrected" strategy win rate that accounts for stop raids. No retail tool offers this. "Your strategy's true win rate is 52%, not 41% — 11 percentage points are stop raids, not strategy failures." This is a single marketing headline with genuine quantitative credibility.

**The OB Survival Curve** — A Kaplan-Meier-style plot of OB failure rate vs age. The inflection point (the OB "half-life") is a publishable finding. "OBs older than 18 candles on M15 EURUSD fail at 2.7× the rate of fresh OBs." This is institutional-grade research output with no retail equivalent.

**The Failure Fingerprint** — Each archetype has a visual radar signature. "The Hope Trap fingerprint: high MFE, low timing risk, London concentration, 73% Long." A researcher who learns these fingerprints can recognise them in real-time trading without the platform. The platform teaches pattern recognition, not just data retrieval. That is a differentiated value proposition.

**Regime Change Alerts** — The rolling failure rate monitor with statistical alerting is the closest thing the platform has to a live strategy health monitor. A funded trader who knows their failure regime has shifted can stop trading and review before losses accumulate. This is a risk management tool, not just a research tool — and that framing justifies premium pricing.

**The Research Loop** — The Failures Lab → Prevention Engine → HypothesisLab pipeline is the platform's most commercially defensible feature. No other tool closes this loop: discover failure pattern → generate exclusion rule → test exclusion impact → promote to live config. Each step is integrated. The researcher never leaves the platform to do something in Excel. This is the Bloomberg terminal value proposition: everything in one place.

---

*End of Failures Lab Full Platform Design — Version 2.0*  
*Next step: visual mockup review, then phased implementation planning beginning with Phase 0 shell.*
