# Failures Lab — Full Product Strategy & Architecture Design
**Date:** May 2026
**Mode:** Product design, research architecture, analytics ideation — NO implementation
**Platform context:** FX-OB Research Lab · React + Tailwind · Client-side only · No backend

---

## Grounding in the Real Codebase

Before any design opinion: the existing platform was reviewed in full.

**What already exists that matters:**

- `HypothesisLab.jsx` already runs exclusion simulations with `SIM_FILTERS` — session, time, structure, OB filters. It saves named hypotheses, compares them, and exports them. It already does lightweight "what if we excluded X?" simulation.
- `NewsLab.jsx` already handles news event analysis: before/after windows, impact filtering, session breakdown, blocked trade counting.
- `ProtectionLab.jsx` (1,778 lines) already handles post-entry defence — penetration thresholds, hard invalidation exits, what-if simulations, heatmaps by hour/weekday/session.
- `EntryHypothesisLab.jsx` inside EntriesLab already manages hypothesis cards with status lifecycle (pending → testing → promising → rejected → promoted).
- Trade fields currently available: `id, direction, structure, session, entry, exit, entry_price, stop, tp, r, outcome, ob_width`.
- OB fields currently available: `id, i0, i1, top, bot, side`.

This grounding matters. It changes everything about how Failures Lab must be positioned. Half of what a naïve Failures Lab design would include is already built. The question is: what is genuinely new, genuinely valuable, and genuinely distinct?

---

## 1. Should Failures Lab Exist?

**Yes. Unambiguously. But with a hard product constraint.**

The case for it is not "we need a place for loser stats." Every existing lab already touches losers — ProtectionLab filters them, HypothesisLab excludes them, NewsLab flags them. The case for Failures Lab is that **no existing lab asks the right upstream question**: *What was true about the world before a trade was entered that predicted it would fail?*

ProtectionLab answers: *what could we have done after entry to limit damage?*
HypothesisLab answers: *what exclusion rules improve the overall numbers?*
NewsLab answers: *what happens near news events (wins and losses alike)?*
Failures Lab must answer: *what is the forensic fingerprint of a losing trade, and what pre-entry conditions predict failure?*

That is a distinct, unfilled product gap.

**The constraint:** Failures Lab must not duplicate HypothesisLab's exclusion simulator, must not duplicate ProtectionLab's invalidation analytics, and must not duplicate NewsLab's news proximity tables. It should FEED those labs — not replace them.

---

## 2. Product Boundary Definition

### Failures Lab OWNS:

- **Failure archetype classification** — the taxonomy and clustering of loss types
- **Pre-entry forensic analysis** — what conditions existed before the trade was taken
- **Excursion science for losers** — MAE, MFE, reversal-before-failure, post-stop continuation
- **Directional asymmetry of failure** — long vs short failure behaviour, tail risk, reversal patterns
- **Failure timing patterns** — when failures cluster temporally (distinct from win timing)
- **Losing streak regime analysis** — is failure clustering random or structured?
- **False loser detection** — stop-raid vs genuine structural failure classification
- **Failure fingerprinting** — quantifiable signatures that identify archetype membership
- **Failure drilldown** — deep individual trade forensics with lifecycle timeline
- **Hypothesis generation from failure patterns** — auto-writing exclusion candidates that feed HypothesisLab

### Failures Lab DOES NOT OWN:

- Exclusion simulation with net R comparison → HypothesisLab (already built; Failures Lab feeds it)
- Post-entry penetration and protection logic → ProtectionLab
- News event creation, calendar import, broad news analytics → NewsLab
- Entry model comparison → EntriesLab
- OB broad analytics → OrderBlockLab

### The Bridge Pattern:

Every meaningful finding in Failures Lab should have a "→ Test this in HypothesisLab" button. The lab is a research engine that generates hypotheses; HypothesisLab is the simulation engine that tests them. This is the highest-value integration in the platform.

---

## 3. Ideal Architecture

Failures Lab must follow the modular workspace pattern established by EntriesLab — NOT the single-page pattern of ProtectionLab. ProtectionLab became 1,778 lines because everything lives in one file. That cannot happen again.

```
frontend/src/
  pages/
    FailuresLab.jsx                    ← workspace shell, module router, global filters

  components/lab/failures/
    shared/
      failuresUtils.js                 ← loser filtering, archetype classification, excursion
      failuresRegistry.js              ← archetype taxonomy, fingerprint definitions
      failuresFormatters.js            ← display helpers, colour tokens per archetype
      failuresAnalytics.js             ← pure analytics: MAE/MFE, streaks, asymmetry
      failuresDataQuality.js           ← field coverage detection, confidence badges

    overview/
      FailuresOverview.jsx             ← failure KPI strip, landscape summary, data quality
      FailureEquityImpact.jsx          ← loser-only equity drawdown curve

    archetypes/
      FailureArchetypes.jsx            ← archetype matrix, cluster summary, treemap
      ArchetypeDetail.jsx              ← drilldown: one archetype's fingerprint + trades
      archetypeClassifier.js           ← pure: classify() returns archetype for any trade

    timing/
      FailuresTiming.jsx               ← temporal heatmaps, weekday/hour/seasonal patterns
      FailureWinDelta.jsx              ← failure rate vs win rate delta by time window

    prefailure/
      PreFailureForensics.jsx          ← pre-entry condition audit
      ConditionScorecard.jsx           ← which pre-entry factors correlate with failure

    excursion/
      ExcursionLab.jsx                 ← MAE/MFE scatter, R distribution for losers
      ReversalBeforeFailure.jsx        ← how far did price run before stopping?
      PostFailureContinuation.jsx      ← how far past stop did price continue?
      StopEfficiency.jsx               ← stop sizing vs post-stop overshoot research

    direction/
      DirectionalAsymmetry.jsx         ← long vs short failure rates, tail risk, MFE/MAE split
      DirectionOptimiser.jsx           ← TP target research by direction

    sessions/
      SessionFailures.jsx              ← session failure rates, origin vs fill session matrix

    news/
      NewsFailures.jsx                 ← failure-specific news cuts (thin; links to NewsLab)

    streaks/
      DrawdownRegime.jsx               ← losing streak clustering, regime breakdown
      StreakSequence.jsx               ← sequence dependency: does loss N predict loss N+1?

    drilldown/
      FailureDrilldown.jsx             ← individual trade forensic inspector
      FailureTimeline.jsx              ← entry → MFE peak → reversal → exit lifecycle view

    hypothesis/
      FailureHypothesisEngine.jsx      ← pattern-to-hypothesis generator; feeds HypothesisLab
```

**Module navigation:** Left-side tab rail (matching the EntriesLab workspace pattern), with a persistent global Failure Cohort Filter at the top that flows into every module.

**Rendering discipline:** Each module is independently collapsible and independently paginated. No module renders more than 300 rows without pagination. All heavy computation lives in `useMemo` inside analytics utility files, never inline in JSX.

---

## 4. Missing High-Value Analytics

The brief identified twelve strong research capabilities. Here are seventeen that are either missing entirely or were underspecified.

### 4.1 False Loser Detection — **Gold. The single most underrated idea in the brief.**

Not all "losses" are strategy failures. Three categories of false losers exist:

**Stop-raid then reversal:** Price stops out by ≤N pips beyond the OB bottom/top, then immediately reverses toward TP. The strategy logic was correct; the stop placement was not. If post-stop continuation data shows price reversed within X candles and reached where TP would have been, this is a stop raid, not a strategy failure. Needs: `post_stop_continuation_r`, `post_stop_reversal_candles`.

**OB retested and won on the retest:** The OB was invalidated but a subsequent retest of the same zone succeeded. The original loss was structural context failure (OB was real, timing was wrong), not OB failure. Needs: `ob_retest_success_n`.

**Directional winner, structural loser:** The direction was correct but the OB was not the right vehicle. Price stopped out of the OB and continued in the original direction but from a different zone. Needs: `post_stop_direction_continuation_r`.

False losers should be visually separated from real losers in every module. Including them in failure archetype counts corrupts the research.

### 4.2 Failure Sequence Dependency

Does losing Trade N make Trade N+1 more likely to fail? This is distinct from streak analysis. The question is: are there conditional failure states? If Trade N was a "fast stopout" archetype, does the next trade on the same OB or same session have elevated failure probability? This would reveal whether failure archetypes cluster causally (regime) or randomly (noise).

Needs: trade sequence index, `consecutive_loser_n`, `prior_trade_archetype`.

### 4.3 Failure Rate Decay / OB Age Survival Curve

Do OBs become more likely to fail as they age? Plot failure rate (y-axis) against OB age in candles or days (x-axis). This produces an OB survival curve — the analogue of a Kaplan-Meier curve in medical research. The inflection point identifies the OB "half-life" after which it should be considered expired regardless of technical criteria.

This is commercially publishable-grade research. No retail tool does this.

Needs: `ob_age_candles` at time of fill.

### 4.4 ATR-Normalised OB Width as Failure Predictor

OB width in pips is meaningless without context. A 10-pip OB on a 100-pip ATR day is tight; the same OB on a 20-pip ATR day is enormous. The ratio `ob_width / atr_at_creation` is the correct normalised measure. Does this ratio predict failure rate? Low ratio = thin OB in high volatility = likely failure.

Needs: `atr_at_ob_creation`, `ob_atr_ratio` (derivable if ATR is available in OB data).

### 4.5 Stop-Hunt Geometry Analysis

When a trade stops out, classify the geometry: (a) clean break — price moved decisively through the stop zone with no reversal; (b) wick stop — price wicked to the stop then reversed on the same candle; (c) gap stop — price gapped past the stop (news or open). Each geometry has a different implication. Wick stops are ambiguous (stop raid or genuine failure). Gap stops are news-driven. Clean breaks are structural. This is distinct from the post-stop continuation analysis — it's about the candle that caused the stop.

Needs: `stop_candle_type` (could be derived from candle data if available).

### 4.6 Failure Rate vs Fill Depth Gradient

At what penetration depth into the OB do losses cluster? A gradient chart (x-axis: fill depth as % of OB from edge to full penetration, y-axis: failure rate) would show whether entries at the edge fail more than entries at 25% depth. This directly feeds entry model selection and connects Failures Lab to EntriesLab without duplicating it.

**This is derivable from existing data if `fill_depth_pct` is added to the exporter.**

### 4.7 Failure Seasonality vs Win Seasonality Delta

The brief correctly identifies seasonal failure clustering. But the insight only becomes actionable when you compare it to win seasonality. The real research question is: *in which windows does the failure rate spike while the win rate stays flat or falls?* That delta window is a genuine exclusion candidate. A failure clustering month without a corresponding win rate drop is not an exclusion candidate — it's just a low-volume month.

This requires no new data — it's a derived view from existing timing + outcome data.

### 4.8 Cohort Failure Mix Evolution

Group all losers by month or quarter. For each cohort, compute the archetype distribution (% fast stopout, % hope trap, % news nuke, etc.). Plot this as a stacked area chart over time. If the failure mix is changing — "news nuke" rising, "hope trap" falling — the strategy is exhibiting adaptive degradation: the market is changing how it beats the strategy. This is an early warning system, not a retrospective tool.

### 4.9 Opposing Liquidity Proximity at Entry

Was there an opposing OB within X pips/R of the entry when the trade was taken? "Entering into opposing liquidity" is one of the most common pre-entry failure predictors in smart money theory. Quantifying how often losers had opposing liquidity nearby vs winners is high-value research.

Needs: `opposing_ob_distance_r` or `opposing_ob_distance_pips` — distance to the nearest opposing OB at fill time.

### 4.10 Cost-Driven Loss Isolation

Some trades stop out not because the strategy failed but because spread, slippage, and commission consumed the edge. If the effective stop width after costs is X pips and the OB is Y pips wide, a cost-ratio above a threshold means the trade was mathematically marginal before it began. Isolating cost-driven losses from structural losses is essential for understanding true strategy edge vs execution drag.

Derivable from: `spread`, `slippage`, `commission` (already in config), `ob_width`.

### 4.11 Partial Recovery Rate After Stopout

For trades that stopped out, what percentage recovered to breakeven or better within N candles after the stop was hit? This is a bridge between Failures Lab and ProtectionLab — it quantifies the opportunity cost of not having a trailing mechanism, and it validates whether BE/partial strategies would have captured trades before failure.

Needs: `post_stop_be_recovery_candles` — new exporter field.

### 4.12 Overextension Score at Entry

How far had price moved from the most recent swing point when the entry was taken? A trade entered into a highly overextended move (price already ran 3× the average move) is statistically more likely to fail. This is a normalised momentum-exhaustion predictor.

Needs: `pips_from_swing` or `atr_multiples_from_swing` at fill time.

### 4.13 Consecutive Loser Statistical Test

The brief mentions losing streak clustering. But the diagnostic test is missing. A runs test (Wald-Wolfowitz) determines whether the binary win/loss sequence is statistically random or exhibits serial dependence. If losses are clustering beyond what random chance predicts, it is evidence of regime-driven failure (a specific market condition is systematically beating the strategy). If losses are random, it is evidence of variance (the strategy is fine; sample size is the issue). This test should be a headline result in the Streaks module.

Derivable from existing outcome data.

### 4.14 HTF Context at Failure

Was the trade counter to the higher-timeframe trend when it failed? If 80% of losers were taken against HTF structure, that is a devastating pre-entry failure predictor and a strong exclusion candidate.

Needs: `htf_context` tag from the exporter — `bullish / bearish / neutral / unknown`. This is the single highest-value new exporter field I would recommend prioritising.

### 4.15 Multi-Run Failure Archetype Comparison

Compare the failure archetype distribution across 2–5 imported runs. If EURUSD M15 has 40% "hope trap" losses but GBPUSD H1 has 15%, the archetype mix is symbol/TF dependent. This is a multi-run analysis that connects to ComparisonLab's existing infrastructure without duplicating it.

### 4.16 Failure Confidence Scoring

Every failure insight should carry a confidence badge identical to the pattern established in EntriesLab (`INSUFFICIENT / LOW N / MODERATE N / ROBUST`). This is already in `entryRegistry.js` via `sampleConfidence(n)`. Failures Lab should import and reuse this utility. No failure-based exclusion hypothesis should be generated unless it clears the MODERATE N threshold.

### 4.17 Failure Fingerprint Radar

For each archetype, a radar/spider chart showing its risk factor profile across six dimensions: timing risk, news risk, directional bias, session risk, OB quality, and pre-entry context score. Each archetype gets a signature shape. Researchers can visually distinguish "fast stopout" (high timing risk, low news risk, high OB quality — probably a sweep hunt) from "news nuke" (high news risk, low timing risk, moderate everything else). This is the archetype's identity card.

---

## 5. Required Data & Exporter Changes

### 5.1 Already Available (No Exporter Changes)

These can be derived in the frontend from existing fields:

| Derived Field | Source | Notes |
|---|---|---|
| `is_loser` | `outcome === 'Loss'` | Filter primitive |
| `entry_hour` | Parse `entry` timestamp | UTC hour |
| `entry_weekday` | Parse `entry` timestamp | 0=Mon, 4=Fri |
| `entry_month` | Parse `entry` timestamp | Seasonal analysis |
| `entry_quarter` | Derive from `entry_month` | Q1–Q4 |
| `trade_duration_mins` | `exit - entry` in ms → mins | Duration classifier |
| `fast_stopout_flag` | `trade_duration_mins < threshold` | Archetype candidate |
| `ob_width_pips` | `ob_width` (already present) | Width analysis |
| `direction_normalised` | Normalise `direction` field | long/short |
| `cost_ratio` | `(spread + slip + comm) / ob_width` | Cost pressure |
| `failure_month_cohort` | `entry_year + entry_month` | Cohort analysis |

### 5.2 High Priority New Fields (Exporter Changes)

These are the highest-value additions that unlock the most research:

| Field | Type | Purpose | Priority |
|---|---|---|---|
| `mae` | float (R) | Maximum Adverse Excursion — how far against before exit | **Critical** |
| `mfe` | float (R) | Maximum Favorable Excursion — furthest in favour before reversal | **Critical** |
| `minutes_to_exit` | int | Time from fill to exit in minutes | **Critical** |
| `post_stop_continuation_r` | float | How far price continued past stop in R terms | **Critical** |
| `fill_depth_pct` | float (0–100) | Penetration depth at fill as % of OB width | **High** |
| `ob_age_candles` | int | Candles since OB was created at time of fill | **High** |
| `htf_context` | enum | `bullish / bearish / neutral / unknown` at HTF | **High** |
| `sweep_present` | bool | Was there a liquidity sweep before entry? | **High** |
| `candles_to_exit` | int | How many candles trade was open | **High** |
| `post_stop_reversal_candles` | int | Candles until price reversed after stop hit | **High** |

### 5.3 Medium Priority New Fields

| Field | Type | Purpose |
|---|---|---|
| `ob_atr_ratio` | float | OB width / ATR at creation — normalised size |
| `atr_at_entry` | float | ATR in pips at fill time — vol regime |
| `opposing_ob_distance_pips` | float | Distance to nearest opposing OB |
| `ob_creation_structure` | enum | `bos / choch` at OB creation time |
| `ob_retest_n` | int | Which retest of this OB (1st, 2nd, etc.) |
| `regime_at_entry` | enum | `trending / ranging / expansion / compression` |
| `premium_discount` | enum | `premium / discount / fair / unknown` |
| `displacement_strength` | enum | `strong / moderate / weak` before entry |

### 5.4 Future / AI-Tier Fields

These require significant exporter investment but unlock the AI research tier:

| Field | Type | Purpose |
|---|---|---|
| `ob_creation_momentum` | float | ATR-normalised momentum of OB creation candle |
| `post_stop_be_recovery_candles` | int | Candles for price to recover to BE after stop |
| `ob_retest_success_history` | JSON | History of prior retests of this OB |
| `news_event_id` | string | FK to news event if within blackout window |
| `news_minutes_offset` | int | Minutes from nearest news event at fill |
| `htf_structure_age_candles` | int | How old the HTF structure was at entry |

### 5.5 Data Quality Strategy

Failures Lab must render gracefully with zero new fields. Every module that requires new fields must:

1. Show a `ProtectionDataQualityPanel`-style coverage badge (reuse the existing pattern)
2. Render a clear "Estimated mode — requires exporter upgrade" notice for affected analytics
3. Never hide the module entirely — show what is possible with existing data first

This mirrors the exact epistemic honesty pattern already established in ProtectionLab. It also means the lab is usable on day one of implementation, before a single exporter change is made.

---

## 6. UX & Workflow Recommendations

### 6.1 The Researcher Workflow

The natural research arc through Failures Lab should be:

```
1. Overview      → "How bad is my loss problem, and what shape does it have?"
2. Archetypes    → "What kinds of losses dominate, and which are avoidable?"
3. Timing        → "When do my avoidable losses cluster?"
4. Pre-Forensics → "What was true before I entered those trades?"
5. Excursion     → "How did those trades actually move? Were any stop raids?"
6. Hypothesis    → "What exclusion rules should I test?" → sends to HypothesisLab
```

Every module should surface a "→ Next" nudge pointing to the logical next step in this arc. Not forced navigation — a contextual prompt.

### 6.2 The Persistent Failure Cohort Filter

This is the most important UX element in the entire lab. A sticky filter bar at the top of the workspace (below the page header, above the module content) that defines the active failure cohort. It should persist as the researcher moves between modules.

Controls:
- **Archetype** multi-select — filter to specific failure types
- **Direction** toggle — All / Long only / Short only
- **Session** multi-select — filter by fill session
- **Date range** picker — isolate a period
- **Structure** toggle — BOS / CHoCH / Both
- **"Compare cohort"** button — opens a second cohort selector for side-by-side comparison

This filter should be collapsible but never hidden entirely. The active filter state should display as pill chips so the researcher always knows what cohort they are looking at.

### 6.3 Cross-Lab Integration

Three hard integration points should be wired from day one:

**→ HypothesisLab:** Any pattern discovered in Failures Lab (e.g. "Monday failures account for 34% of all losses") should have a one-click "Create Hypothesis" button that pre-populates a hypothesis card in HypothesisLab with the relevant exclusion filter pre-selected.

**→ Trade Inspector:** Any trade in the Failure Drilldown module should have a "View in Trade Inspector" link. The existing `TradeInspector.jsx` page accepts a trade ID — this link should route to it.

**→ ProtectionLab:** The Excursion module should display a contextual note when stop raids or partial recoveries are detected: "These trades may be candidates for BE stop management → view in Protection Lab."

### 6.4 State Persistence

The following should persist to localStorage across sessions:

- Active module tab
- Cohort filter state
- Saved forensic views (named cohort + module combinations)
- Archetype colour overrides (power user)
- Collapsed/expanded panel states per module

Storage key convention: `fxob_failures_*` to match existing `fxob_*` pattern.

### 6.5 Collapsibility Discipline

Every NeonPanel in Failures Lab should use `collapsible={true}`. Secondary panels should default to `defaultCollapsed={true}`. The ProtectionLab anti-pattern — 1,778 lines with zero collapsed panels — must not be repeated.

---

## 7. Visual Analytics Recommendations

### 7.1 Must-Build Charts

**MAE/MFE Scatter Plot** — X-axis: MFE (maximum favorable excursion in R, 0 to +N). Y-axis: MAE (maximum adverse excursion in R, 0 to -N). Each dot is a loser. Colour by archetype. The shape of this cloud tells the researcher everything: trades clustered near zero MFE with high MAE were never right; trades with high MFE but also high MAE were hope traps. This is the single most information-dense chart in the lab. Use Recharts `ScatterChart`. Requires `mae` and `mfe` fields.

**Weekday × Hour Failure Rate Heatmap** — Identical to the pattern already in ProtectionLab (`heatmap mode` in DataTable). But this one shows failure RATE (% of trades in that cell that are losers) rather than raw loss count. The delta between this heatmap and the win-rate heatmap reveals exploitable temporal windows. Build as a pure 7×24 grid with CSS `background-opacity` scaling by failure rate.

**Post-Stop Continuation Histogram** — X-axis: how far price went past stop (in R or pips, bucketed: 0–10%, 10–25%, 25–50%, 50–100%, 100–150%, 150–200%, 200%+). Y-axis: count of losers. A spike at 0–10% continuation strongly implies stop raids dominate. A flat distribution implies genuine structural failures. Recharts `BarChart`.

**Reversal-Before-Failure Distribution** — X-axis: how far the trade ran in favour before reversing and hitting stop (bucketed: never moved, 0–0.25R, 0.25–0.5R, 0.5–1R, 1–1.5R, 1.5–2R, 2R+). Y-axis: count. This chart directly informs the break-even stop and partial-take discussions. The inflection point where the distribution peaks tells you where the BE stop should be placed.

**Failure Archetype Treemap** — Nested rectangles. Outer: archetype family (timing, execution, structural, external). Inner: specific archetype. Size: trade count. Colour: average loss magnitude (deeper red = bigger loss). Libraries: can be built with D3 or with a pure SVG treemap in Recharts. This replaces the naive "bar chart of loser types."

**Sankey: Trade Lifecycle Flow** — Entry population → [Fill / No Fill] → [Win / Loss] → [Archetype bucket]. For the Loss branch: → [False Loser / Genuine Failure] → [Stop Raid / News Nuke / Fast Stopout / Hope Trap / Hard Invalidation / etc.]. Requires D3 Sankey layout. This is the highest-complexity chart in the lab but also the most institutionally impressive.

**Directional Asymmetry Chart** — A paired horizontal bar chart. One row per metric (Win Rate, Expectancy, MAE, MFE, Profit Factor). Two bars per row: Long vs Short. Diverging bars from centre. Immediate visual answer to "do longs or shorts fail differently and by how much?"

**OB Age Survival Curve** — X-axis: OB age at fill (in candles or days). Y-axis: cumulative failure rate. Like a Kaplan-Meier survival curve. The curve shows at what age OBs become unreliable. This is the most novel chart in the lab and has no equivalent in any retail trading tool.

**Failure Fingerprint Radar** — Per archetype: a hexagonal radar (spider) chart with six dimensions — timing risk score, news risk score, directional bias score, session risk score, OB quality score, pre-entry context score. Each archetype gets a saved SVG fingerprint. Build with Recharts `RadarChart`.

**Equity Curve with Failure Archetype Overlay** — The standard equity curve, but losers are plotted as coloured dots on the line, each coloured by archetype. A researcher can immediately see "all my news nuke losses happened during this drawdown cluster." Build using `EquityCurveV2` (already in codebase, already in the component library) with a `failureArchetype` prop added to the dot renderer.

### 7.2 Charts to Skip (or Defer)

**Candlestick overlays per failure** — too complex for Phase 1, requires candle data which may not be present. Defer to Failure Drilldown once CandleChart integration is established.

**Sequence clustering dendrograms** — only relevant once AI classification is active. Do not build this manually.

---

## 8. Power User Features

### 8.1 Failure Cohort Builder (Query Mode)

A toggle from the standard filter bar to a "Query Mode" — a structured filter builder where researchers can compose multi-condition cohorts:

```
Include trades where:
  [outcome = Loss] AND
  [session = London] AND
  [direction = Long] AND
  [entry_hour >= 8 AND entry_hour <= 10]
```

Not free-text SQL — a UI-driven condition builder, similar to what Notion's filter system does but adapted to trade fields. Outputs a named cohort that can be saved and compared.

### 8.2 Baseline vs Excluded Equity Simulation

When a researcher identifies a failure cohort (e.g. "all Monday London Long losses"), a "Simulate exclusion" panel should appear showing:
- Net R delta vs baseline
- Win rate delta
- Trade count reduction
- Updated expectancy

This is different from HypothesisLab's simulator. Failures Lab's version is cohort-driven (based on failure-specific filters). HypothesisLab's version is rule-driven (based on predefined SIM_FILTERS). The two are complementary. Failures Lab generates the insight; HypothesisLab formalises the rule.

Do not fully duplicate the HypothesisLab sim here. A lightweight estimate is sufficient. A "→ Test this in HypothesisLab" button should be prominent.

### 8.3 Saved Forensic Views

Researchers should be able to save a named view that captures:
- Active module tab
- Cohort filter state  
- Any expanded/collapsed panels
- Notes field (free text annotation)

Storage: `fxob_failures_saved_views` in localStorage. Limit: 20 saved views. Render as a dropdown/panel picker in the workspace header.

This is the "bookmark" pattern. It makes Failures Lab a research journal, not just an analytics dashboard.

### 8.4 Failure Tagging (Manual Override)

Researchers should be able to manually reclassify a trade's archetype. The classifier will get things wrong — a trade that looks like a "slow bleed" might be a "hope trap" to a trader who was watching. Manual overrides should:
- Store in localStorage under `fxob_failures_tags`
- Take precedence over algorithmic classification
- Be visually distinct (show an "edited" badge on the archetype pill)
- Be exportable as CSV for review

### 8.5 Cross-Run Failure Comparison

A dedicated "Compare" panel (distinct from ComparisonLab) that shows the failure archetype distribution for 2–5 selected runs side-by-side. The question it answers: "does EURUSD M15 fail for the same reasons as GBPUSD H1?" If not, exclusion rules are symbol-specific — a critical finding for multi-pair strategies.

### 8.6 Failure Report Export

A one-click "Export Failure Report" that generates a structured CSV with one row per losing trade, columns for: trade ID, archetype, direction, session, MAE, MFE, post-stop continuation, pre-entry flags, and any manual tags. This CSV can be fed into external tools (Python, Excel) for further analysis. The export pattern already exists in `entryAnalytics.js` via `downloadCsv` — reuse it.

---

## 9. AI Future Opportunities

These are sequenced by ROI, not by complexity.

### 9.1 Auto-Classification Engine (Phase 1 AI)

Replace the hand-coded archetype classifier with a k-means or DBSCAN clustering algorithm running in a Web Worker. Input: normalised trade feature vectors (duration, MAE, MFE, news proximity, session, direction). Output: cluster assignments with centroid-derived archetype labels. The researcher reviews and names the clusters; the algorithm discovers them.

This means archetypes are not predefined — they emerge from the data. A strategy might have a unique archetype that the taxonomy never anticipated.

### 9.2 Feature Importance Ranking (Phase 1 AI)

Given the set of losing trades, rank pre-entry features by their predictive power for failure. Use a simple random forest or gradient boosting model in-browser (TensorFlow.js or ONNX runtime). Output: "The top 3 predictors of failure in your dataset are: (1) HTF counter-trend context, (2) Monday entry, (3) OB age > 14 days." This is immediately actionable and does not require a backend.

### 9.3 Anomaly Detection (Phase 2 AI)

Flag trades that don't fit any known archetype — the outliers. These are either (a) novel failure modes the taxonomy hasn't seen yet, or (b) data errors. Either way, they deserve manual review. Alert in the Overview module: "3 trades do not match any known archetype — review in Drilldown."

### 9.4 Auto-Hypothesis Generation (Phase 2 AI)

Scan the failure pattern analysis across all modules and automatically generate candidate hypothesis cards:

> **Auto-detected:** "Trades taken on Mondays during the London session between 08:00–10:00 UTC have a 73% failure rate vs 41% overall. Sample: 22 trades (MODERATE N). Suggested exclusion: Exclude Monday London 08–10 UTC entries."

These cards are pre-populated in HypothesisLab with one click. The researcher reviews, accepts or rejects, and runs the simulation. The AI generates candidates; the researcher exercises judgment. This is the correct human-AI collaboration model for a research tool.

### 9.5 Regime Change Detection (Phase 3 AI)

Train a rolling model on the failure archetype mix over time. When the mix shifts significantly — "news nuke" failures up 40% over the last 30 trades vs the prior 90-trade baseline — emit an alert: "Failure regime shift detected. Your strategy may be becoming more sensitive to news events in the current market environment." This is a live adaptive degradation warning system.

### 9.6 Cross-Symbol Pattern Transfer (Phase 3 AI)

Given multiple imported runs across symbols, identify failure archetypes that transfer: if the same pre-entry conditions predict failure on both EURUSD and GBPUSD, the exclusion rule is robust and symbol-agnostic. If the archetype only appears on one symbol, it may be pair-specific noise. This requires multi-run analysis with a shared feature space.

### 9.7 Stop Design Optimiser (Phase 3 AI)

Feed the post-stop continuation data into a Bayesian optimisation loop: "Given that 68% of stop raids occur within 3 pips of the OB bottom, what is the optimal stop buffer that maximises the false-loser recovery rate without materially worsening genuine-failure losses?" This is a direct bridge to ProtectionLab's stop research.

---

## 10. Commercial Product Thinking

If Failures Lab became a standalone premium paid research feature, these are the elements that would justify the price:

**The False Loser Detector** is unique. No retail backtesting tool distinguishes stop raids from genuine failures. This alone is a marketing differentiator. "Know which losses you could have avoided vs which ones were unavoidable" is a compelling headline.

**The OB Survival Curve** is institutionally credible. Publishing that "OBs older than 18 candles fail at 2.3× the rate of fresh OBs" is the kind of quantitative insight that attracts serious traders.

**The Failure Fingerprint Radar** is visually distinctive. No other retail tool has a per-archetype risk signature chart. It makes the platform feel like Bloomberg.

**The Auto-Hypothesis Engine** is the highest-leverage feature. Turning failure analysis into actionable hypotheses without manual effort is the core value proposition of a research platform. It collapses the research cycle from weeks to hours.

**The Cohort Builder** is the power-user hook. Researchers who outgrow preset filters will use the query builder daily. It is the feature that creates daily active users, not just occasional checkers.

**The Cross-Run Failure Comparison** is the multi-strategy unlock. A trader running 3 pairs needs to know if the same rules apply to all three. This feature answers that and justifies running all pairs through the platform.

---

## 11. Quick Wins (Implement First, No New Exporter Fields)

These deliver value immediately using only existing trade data.

1. **Failure Archetype Classifier (rule-based)** — classify all losers using derivable fields: duration bucket (fast stopout / slow bleed), MFE bucket (never moved / hope trap), structure (hard invalidation based on existing `ob_fully_breached` / `max_ob_penetration_pct` fields already in ProtectionLab analytics). The classifier in `archetypeClassifier.js` can be built today.

2. **Temporal Failure Heatmap** — weekday × hour failure rate using existing `entry` timestamp. Zero new fields required. Recharts BarChart with heatmap shading.

3. **Directional Asymmetry Panel** — long vs short win rate, expectancy, profit factor from existing `direction` and `r` fields. Table + diverging bar chart. One afternoon of work.

4. **Session Failure Rates** — failure rate by session using existing `session` field. Already derived in protectionAnalytics.js — the pattern is directly reusable.

5. **Failure Equity Curve Overlay** — equity curve coloured by outcome (losers shown as red dots). `EquityCurveV2` already exists in the codebase and is imported nowhere in any failure context. Wire it to a losers-filtered dataset.

6. **Losing Streak Analysis** — consecutive loss counter derivable from the ordered trade sequence. Runs test (Wald-Wolfowitz) is pure statistics, no new data.

7. **Cost-Driven Loss Isolation** — using `spread`, `slippage`, `commission` from config + `ob_width` from trades. Derivable today.

8. **Overview KPI Strip** — total losses, loss rate, average loss R, worst loss, longest streak, most common archetype. All from existing data.

9. **→ HypothesisLab integration buttons** — one-click "Create Hypothesis" wired to the existing HypothesisLab localStorage format (`fxob_entry_hypotheses_v1`). Pre-populate the title and description. Zero new infrastructure; just a router link + localStorage write.

10. **Failure Drilldown Table** — sortable DataTable of all losers with archetype pills. Reuse `DataTable.jsx` which already has `heatmap` mode. Add a click handler to open Trade Inspector.

---

## 12. Medium Upgrades (Require Some Exporter Changes)

These become available once 2–3 new exporter fields land.

1. **MAE/MFE Scatter Plot** — requires `mae` and `mfe`. The single highest-impact chart in the lab. Prioritise these two fields above all others.

2. **Post-Stop Continuation Analysis** — requires `post_stop_continuation_r`. Directly answers "how many of my losses were stop raids?"

3. **Reversal-Before-Failure Distribution** — requires `mfe`. Informs break-even stop placement.

4. **OB Age Analysis** — requires `ob_age_candles`. Enables the survival curve.

5. **Fill Depth Failure Gradient** — requires `fill_depth_pct`. Connects Failures Lab to EntriesLab research.

6. **Stop Efficiency Analysis** — requires `post_stop_continuation_r` and `mfe`. Reveals over/undersized stops.

7. **News Failures Module** — requires `news_minutes_offset`. Provides failure-specific news cuts beyond what NewsLab already has.

8. **Pre-Entry Forensics (Sweep + Displacement)** — requires `sweep_present` and `displacement_strength`. Two binary/enum fields that unlock substantial pre-entry analysis.

9. **Cohort Failure Mix Evolution** — requires dates (already present) + archetype (quick win classifier). Once the classifier is built, this is derivable immediately.

10. **Cross-Run Failure Comparison** — requires multi-run loaded state (already supported in store.js). Build the UI comparison panel once archetypes are classified.

---

## 13. Major Platform Bets (Ambitious, Long-Term)

These are the large architectural investments that make Failures Lab a research platform, not just an analytics page.

1. **AI Clustering Engine** — Web Worker running k-means on trade feature vectors. Replaces the rule-based classifier with a data-driven one. Requires: `mae`, `mfe`, `post_stop_continuation_r`, `ob_age_candles`, `htf_context`. Timeline: once medium exporter upgrades are complete.

2. **Auto-Hypothesis Generator** — scans all module outputs and generates hypothesis cards automatically. Requires: all quick win modules complete + HypothesisLab integration. Feeds into a fundamentally different research workflow.

3. **OB Survival Curve + Half-Life Calculation** — a Kaplan-Meier-style survival analysis on OB age vs failure rate. Requires `ob_age_candles` and a sample of 100+ losers to be statistically meaningful. The output is a publishable research finding.

4. **False Loser Detection Engine** — automated classification of stop raids using `post_stop_continuation_r`, `post_stop_reversal_candles`, and candle geometry. Requires exporter investment. Has a disproportionate impact on strategy confidence — if 25% of "losses" are actually stop raids, the true failure rate is fundamentally different.

5. **Failure Regime Monitor (rolling alert)** — tracks the failure archetype mix over a rolling N-trade window and alerts when the mix shifts significantly. Requires archetype classification + at least 150 trades of history. This is an adaptive degradation early warning system.

6. **Sidecar Python Integration** — when the optional Electron/Tauri sidecar lands (already in the PRD backlog as "Research Workstation"), Failures Lab should be the first lab to integrate a Python analysis script that runs proper statistical tests: Chi-square on archetype distributions, survival analysis, feature importance via scikit-learn. The frontend lab becomes the consumer of these outputs.

---

## 14. Highest ROI Recommendations

Ranked by impact per unit of implementation effort:

**#1: Build the archetype classifier first.**
It is the foundation of everything else in the lab. Without archetype classification, there is no Failures Lab — there is only a table of losers. The rule-based classifier (fast stopout, slow bleed, hope trap, hard invalidation) can be built in one session using existing data. Every other module depends on it.

**#2: Wire the → HypothesisLab integration.**
This is the highest-leverage integration in the entire platform. It closes the research loop: Failures Lab discovers patterns, HypothesisLab tests them. Without this, Failures Lab is a dead end — interesting but not actionable. The integration requires writing to an existing localStorage key. It should ship in the same version as the first modules.

**#3: Prioritise `mae` and `mfe` as the first two exporter fields.**
These two fields unlock the MAE/MFE scatter, the reversal-before-failure distribution, and the stop efficiency analysis simultaneously. They are the most analytically dense of all new fields. Request them before any other exporter change.

**#4: Build the Temporal Heatmap and Directional Asymmetry panels early.**
These are quick wins (no new fields) with high researcher engagement. They produce findings immediately and demonstrate lab value before the deeper analysis is built. They also feed hypothesis candidates directly.

**#5: Design the Persistent Cohort Filter as the first UX element.**
Everything else in the lab depends on the ability to filter to a failure cohort. Build the filter bar before building any analysis module. A researcher who can't filter to "London Long losses only" cannot use the lab effectively.

**#6: Request `htf_context` as the third exporter field after mae/mfe.**
If 70–80% of losers turn out to be counter-HTF trades, this single field produces the most commercially significant finding of any research this platform can generate. It may be the most important exporter addition in the platform's history.

**#7: Implement the EquityCurveV2 overlay with failure archetype dots.**
`EquityCurveV2` already exists in the codebase and is already imported nowhere in a failure context. Adding archetype-coloured loss dots to the equity curve makes losing streaks immediately visual. This requires zero new infrastructure — just a prop addition and a data mapping.

**#8: Do not build the Sankey diagram until sample sizes are large.**
It is the most visually impressive chart in the lab. It is also the most misleading at small sample sizes. Gate it behind a minimum trade count (100+ losers) and build it last.

---

## 15. Challenges and Pushback

### "Should News Failures be a module here or just in NewsLab?"

Both. NewsLab answers "what happens near news events for all trades." The Failures Lab news module answers "of my losing trades, how many were news-proximate, and what does that mean for which events I should be trading through?" The filter direction is different. NewsLab filters by event proximity; Failures Lab filters by outcome = Loss first, then checks news. Keep a thin module in Failures Lab that cross-links to NewsLab for the heavy news analytics.

### "Is Pre-Entry Forensics just EntriesLab rebranded?"

No. EntriesLab asks "which entry model produces better overall results?" Pre-Entry Forensics asks "among my losers, what were the structural conditions that were present?" The question is backward-looking forensics on a filtered cohort, not forward-looking model comparison. The datasets overlap; the question does not.

### "Should Hypothesis Engine be here or in HypothesisLab?"

Generation here, execution there. The hypothesis generator in Failures Lab looks at failure patterns and produces candidate hypotheses. HypothesisLab runs the simulation and manages the hypothesis lifecycle. Keep the distinction clean. Failures Lab should not run simulations; it should generate inputs to the simulator.

### "Is this lab too ambitious for client-side only?"

The quick wins (archetypes, timing, directional, session, streaks, drilldown) are entirely achievable client-side. The AI tier (clustering, feature importance) requires Web Workers but is still client-side. The statistical testing (Wald-Wolfowitz, Chi-square) is pure math — no backend needed. The only features that genuinely require a backend are: live news calendar updates and OB survival analysis on very large datasets (10,000+ trades). Everything in the quick-win and medium-upgrade tiers is within the existing architecture.

### "What's the biggest risk in this design?"

Archetype inflation. There are currently twelve archetypes proposed. If the classifier produces twelve buckets with average N of 8–12 trades each, every bucket is statistically meaningless. The right approach is: start with five archetypes (fast stopout, slow bleed, hope trap, hard invalidation, external/news). Add more only when sample size justifies it. The `sampleConfidence(n)` utility already in `entryRegistry.js` should gate every archetype display. An archetype with INSUFFICIENT N should display as a single greyed-out pill, not a full analytical panel.

---

*End of Failures Lab Design Document.*
*Ready for architecture review and implementation planning.*
