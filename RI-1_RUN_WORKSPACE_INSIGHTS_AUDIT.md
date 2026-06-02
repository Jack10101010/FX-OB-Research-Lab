# RI-1 — Run Workspace Algorithmic Insights Audit
**MODE:** AUDIT ONLY — no implementation, no file modifications, no AI/LLM, no backend.
**DATE:** 2026-06-02

---

## 1. Files Read

| File | Purpose |
|---|---|
| `frontend/src/pages/RunDetail.jsx` | Run Workspace host — all run-level computed data |
| `frontend/src/data/projectWorkflow.js` | `buildRunDelta`, `summarizeRunForDelta`, `resolveRunReference`, findings model |
| `frontend/src/data/resultsBasis.js` | Canonical `summarizeTrades`, `summarizeBuckets`, `toCanonicalBucketRow`, delta schemas |
| `frontend/src/data/tradeUniverse.js` | `resolveTradeUniverse`, variant/scenario resolution, `summarizeTradeSanity` |
| `frontend/src/lib/tableCompare.js` | `buildTableComparison`, `COMPARE_METRIC_DEFS`, delta engine |
| `frontend/src/components/lab/protection/protectionAnalytics.js` | `buildObBreakdown`, `buildPenetrationSweep`, `calcRobustnessScore`, breach/session data |
| `frontend/src/components/lab/entries/analytics/entryAnalytics.js` | `entryRowFromSummary`, `entryStatsFromTrades`, `buildTriggeredEdgeFunnel`, `baselineEntryRow` |
| `frontend/src/pages/OrderBlockLab.jsx` | `buildInsights()` implementation, all bucket defs, `LOW_SAMPLE_N=10` guard |
| `frontend/src/pages/NewsLab.jsx` | `buildExactNewsSummary`, `buildOverlapAnalytics`, `buildBreakdowns`, impact/blackout fields |
| `frontend/src/data/store.js` | `addProjectFinding` signature, run bundle structure |
| `frontend/src/data/tradeClassification.js` | `isPerformanceTrade`, `isWinTrade`, `isLossTrade`, `summarizeTradeSanity` |

---

## 2. Available Data Sources (What Exists on RunDetail)

### 2a. Run-Level Config Fields (from `runData.config` / `run`)

| Field | Key | Notes |
|---|---|---|
| Symbol | `config.symbol` / `run.symbol` | e.g. `EURUSD` |
| Detection TF | `config.detection_timeframe` | e.g. `15m` |
| Execution TF | `config.execution_timeframe` | e.g. `1m` |
| RR | `config.rr_multiple` / `run.rr` | numeric |
| Structure filter | `config.structure_filter` | `"bos"` / `"choch"` / `"both"` |
| Trade direction | `config.trade_direction` | `"long"` / `"short"` / `"both"` |
| Entry depth % | `config.ob_entry_depth_pct` | numeric |
| Entry buffer pips | `config.entry_buffer_pips` | numeric |
| Stop buffer pips | `config.stop_buffer_pips` | numeric |
| Verify ticks | `config.verify_limit_ticks` | numeric |
| Session filter enabled | `config.session_filter_enabled` | bool |
| Allowed sessions | `config.allowed_sessions` | array |
| News blackout enabled | `config.news_blackout_enabled` | bool |
| News blackout window | `config.news_blackout_minutes_before/after` | numeric |
| News impacts | `config.news_blackout_impacts` | array |
| Date range | `run.dateRange` | string / object |
| Execution mode (variant) | `config.execution_mode` | single / multi / one_per_direction |
| Spread/slippage/commission | `config.spread_pips`, `slippage_pips`, `commission_r_per_trade` | numerics |

### 2b. Computed in RunDetail `useMemo` Hooks

All of these are **already computed** — no new computation is required to read them.

| Computed Object | Fields Available |
|---|---|
| `validTradesForRun` | Filtered `isPerformanceTrade` trade list |
| `validTradeCount` | Integer |
| `validNetR` | Σ R of valid trades |
| `validWinsCount` / `validLossesCount` | Integer |
| `validWinRate` | Pct (wins / decided) |
| `expectancy` | validNetR / validTradeCount |
| `pf` (profit factor) | Σwins / \|Σlosses\| |
| `maxDd` | Peak-to-trough in R |
| `obStats` | Full lifecycle funnel (see 2c below) |
| `outcomeSummary` | Wins/losses/special/news/session/avg/payoff/bestR/worstR |
| `R_DIST_V2` | 7 semantic R buckets with count/pct |
| `directionalOutcomeStats` | Long and Short split: trades/wins/losses/netR/winRate/avgR |
| `MONTHLY` | Monthly net R array `[{m, v}]` |
| `deltaRows` | Per-metric deltas vs reference run |
| `runReference` | Resolved reference run + reason |
| `autoInsights` | **3 text strings already generated** (see 2d) |

### 2c. `obStats` Object (computed from `runData.orderBlocks` + `runData.trades`)

```
{
  total, bullish, bearish, avgWidthPips,
  sessionFilteredCount, newsCancelledCount, reverseCancelledCount,
  invalidatedCount, filledCount, unfilledCount, eligibleCount,
  filledWins, filledLosses, filledBE, filledUnlinked,
  dirStats: {
    long:  { obCount, trades, wins, losses, be, netR, convPct },
    short: { obCount, trades, wins, losses, be, netR, convPct }
  },
  sessionFilterEnabled, newsEnabled, directionRestricted, directionRespected
}
```

### 2d. `autoInsights` — Already Exists (RunDetail lines 934–991)

RunDetail already computes `autoInsights` as a `useMemo` returning up to 3 text strings:
- Full-stop loss concentration (≥ 75% of losses are full −1R)
- Top win bucket (≥ 40% of wins exceed +3R)
- Payoff ratio ≥ 2.5×
- News flatten / session filter / news blackout / missed trade counts
- Directional dominance (one side > 60% of net R)

This is **scope 0 work** — it already exists. The insight engine design below extends this significantly.

### 2e. What-Changed Delta (`deltaRows` from `buildRunDelta`)

Five metrics with `{ current, reference, delta, direction, label, unit, digits }`:
- `netR`, `winRate`, `trades`, `profitFactor`, `maxDd`
- `direction`: `"up"` / `"down"` / `"neutral"` / `"na"`
- Reference source: `"baseline"` / `"previous_project"` / `"previous_imported"` / `"none"`

### 2f. Trade-Level Fields Available for Bucketing

Each trade in `tradesForRun` carries:
- `direction` (Long/Short), `structure` (BOS/CHoCH)
- `fillSession` / `session` (Asia/London/London Lull/New York/Outside)
- `entry` (ISO timestamp), `exit` (ISO timestamp)
- `r` (R value), `outcome` (WIN/LOSS/BREAKEVEN/NEWS_FLATTEN/…)
- `news_action`, `news_blackout`, `news_flatten_r`
- `missed_reason`, `missed_trade`
- `protection_exit_reason`
- `obId` / `displayObId` (links to OB)
- `displayTradeId`

---

## 3. Reusable Analytics (What Labs Already Compute)

### 3a. Structure Buckets — `buildOrderBlockAnalytics()` in OrderBlockLab
```
structureRows: [{ label: "BOS"|"CHoCH", count, netR, winRate, expectancy, profitFactor, ciLo, ciHi, tradeRefs }]
```
- Sample guard: `LOW_SAMPLE_N = 10`
- Gap threshold for insight: expectancy gap ≥ 0.1R

### 3b. Direction Buckets — OrderBlockLab + RunDetail `directionalOutcomeStats`
RunDetail already computes: `Long/Short × { trades, wins, losses, netR, winRate, avgR }`
OrderBlockLab extends with: `expectancy gap ≥ 0.15R` insight threshold

### 3c. Sessions — OrderBlockLab `sessionMatrix` + RunDetail `SessionSplit`
Session matrix: OB origin × fill session cross-tab with netR per cell.
Available sessions: Asia, London, London Lull, New York, Outside.
Best-cell insight threshold: netR > 0.5R over n ≥ LOW_SAMPLE_N

### 3d. Penetration — `buildPenetrationSweep()` in protectionAnalytics.js
Threshold sweep 50%→100% (step=5): `{ threshold, count, savedR, projectedNet, deltaVsBaseline }`
Also: `buildObBreakdown().byDepth` with 6 depth buckets and expectancy per bucket

### 3e. News Overlap — NewsLab `buildExactNewsSummary()` + `buildOverlapAnalytics()`
- `exactSummary.blockedNetR` — R impact of exact blackout trades
- `overlapAnalytics` — front-end overlap estimate
- `outcomeSummary.newsFlatten / newsTouchCancel / newsBlackout` — in RunDetail already

### 3f. Protection/Breach — `protectionAnalytics.buildObBreakdown()` and `calcRobustnessScore()`
- `byDepth`: 0–25%, 25–50%, 50–75%, 75–100%, >100% buckets
- `calcRobustnessScore()`: composite 0–100 score (netDelta + ddImprovement + efficiency + samplePenalty)
- `calcEfficiencyRatio()`: loserRSaved / winnerRCost — > 1 = saves more than it costs

### 3g. What-Changed Deltas — `buildRunDelta()` in projectWorkflow.js
Five-metric delta strip. Already rendered in ResearchStrip. Provides:
`direction = "up"|"down"|"neutral"|"na"` for netR, winRate, trades, profitFactor, maxDd

### 3h. Entry Model Funnel — `buildTriggeredEdgeFunnel()` in entryAnalytics.js
For triggered-edge scenarios: tapped → triggered → armed → filled → W/L
FillAfterTriggerRate, retraceCancelCount, sameCandleCount, nextCandleCount

### 3i. R Distribution — RunDetail `R_DIST_V2`
Seven semantic buckets tied to configured RR. Already computed. Bucket `bar` and `pct` ready.

### 3j. Monthly Performance — RunDetail `MONTHLY`
`[{m: "Jan '25", v: 1.2}]` — sign per month already computed. Ready for streak/consistency rules.

---

## 4. Proposed Insight Engine

### Design Principle
**All inputs are already-computed `useMemo` values in RunDetail.** The engine is a pure function that reads these objects and applies threshold rules, returning a typed insight list. Zero new data fetching, zero LLM, zero backend.

```
generateRunInsights(inputs) → InsightResult[]
```

### Inputs

```js
{
  // Core metrics
  validTradeCount,         // integer
  validNetR,               // number (R)
  validWinRate,            // number (%)
  expectancy,              // number (R/trade)
  pf,                      // number
  maxDd,                   // number (R, positive)

  // Distribution
  R_DIST_V2,               // [{label, count, pct, bar, color}] — 7 buckets
  outcomeSummary,          // {wins,losses,breakeven,special,winRate,avgWin,avgLoss,
                           //  payoffRatio,bestR,worstR,newsFlatten,newsTouchCancel,
                           //  newsBlackout,sessionFiltered,unfilled,missed}

  // Directional split
  directionalOutcomeStats, // [{side:"LONG"|"SHORT", trades,wins,losses,netR,winRate,avgR}]

  // OB lifecycle funnel
  obStats,                 // full object (see §2c)

  // Monthly
  MONTHLY,                 // [{m, v}]

  // What-changed delta
  deltaRows,               // [{key,label,current,reference,delta,direction,unit,digits}]
  runReference,            // {run, reason}

  // Config
  runRr,                   // configured RR (number)
  runConfig,               // full config object
  structureFilter,         // "bos"|"choch"|"both"|null
}
```

### Rules & Thresholds

Each rule is a named, deterministic function: `check_<name>(inputs) → InsightResult | null`

#### CATEGORY A — Positive Edge

| Rule ID | Condition | Confidence | Min N |
|---|---|---|---|
| `A1_win_rate_strong` | winRate ≥ 60% | high | 20 |
| `A2_expectancy_strong` | expectancy ≥ 0.4R | high | 15 |
| `A3_pf_strong` | pf ≥ 2.0 | high | 15 |
| `A4_payoff_ratio` | payoffRatio ≥ 2.5 | medium | 10 |
| `A5_directional_winner` | one side > 60% of netR AND that side netR > 0 AND n ≥ 10 | medium | 10/side |
| `A6_structure_winner` | one structure's expectancy − other ≥ 0.15R | medium | 10/struct |
| `A7_full_winners` | top R bucket (> RR−0.05) ≥ 40% of wins | medium | 10 wins |
| `A8_monthly_consistency` | ≥ 70% of months positive AND ≥ 6 months | medium | 6 months |
| `A9_fill_funnel_healthy` | filledCount/eligibleCount ≥ 0.50 | low | 20 OBs |

#### CATEGORY B — Negative Leak

| Rule ID | Condition | Confidence | Min N |
|---|---|---|---|
| `B1_full_stop_concentration` | ≤−1R bucket ≥ 75% of losses | high | 5 losses |
| `B2_short_losing` | Short side netR < −1R AND trades ≥ 10 | high | 10 |
| `B3_long_losing` | Long side netR < −1R AND trades ≥ 10 | high | 10 |
| `B4_low_fill_rate` | filledCount/eligibleCount < 0.28 | medium | 20 OBs |
| `B5_high_session_filter_loss` | sessionFilteredCount/total > 0.30 | medium | 30 OBs |
| `B6_high_news_cancel` | newsCancelledCount/total > 0.15 | medium | 20 OBs |
| `B7_invalidation_dominates` | invalidatedCount > filledCount AND invalidatedCount ≥ 10 | medium | 10 |
| `B8_bull_bear_skew` | one direction > 70% of OBs | low | 20 OBs |
| `B9_news_flatten_drag` | newsFlatten ≥ 5 AND outcomeSummary.newsFlatten/validTradeCount ≥ 0.10 | low | 5 |
| `B10_negative_expectancy` | expectancy < −0.1R | high | 10 |
| `B11_monthly_losing_streak` | ≥ 3 consecutive negative months in MONTHLY | medium | 4 months |
| `B12_high_reverse_cancel` | reverseCancelledCount/total > 0.10 | low | 20 OBs |

#### CATEGORY C — Biggest Change vs Reference

| Rule ID | Condition | Confidence | Min N |
|---|---|---|---|
| `C1_net_r_improved` | deltaRows[netR].direction === "up" AND delta ≥ 1R | high | reference exists |
| `C2_net_r_degraded` | deltaRows[netR].direction === "down" AND delta ≤ −1R | high | reference exists |
| `C3_win_rate_shifted` | abs(deltaRows[winRate].delta) ≥ 5pp | medium | reference exists |
| `C4_pf_shifted` | abs(deltaRows[profitFactor].delta) ≥ 0.3 | medium | reference exists |
| `C5_trade_count_diverged` | abs(deltaRows[trades].delta) / reference.trades ≥ 0.20 | low | reference exists |
| `C6_drawdown_improved` | deltaRows[maxDd].direction === "up" AND delta ≥ 0.5R | medium | reference exists |

#### CATEGORY D — Low-Confidence Warning

| Rule ID | Condition | Confidence |
|---|---|---|
| `D1_low_sample` | validTradeCount < 15 | n/a — suppresses other insights |
| `D2_index_only` | runData.indexOnly === true | n/a — suppresses all insights |
| `D3_unlinked_obs` | obStats.filledUnlinked > 0 AND filledUnlinked/filledCount ≥ 0.20 | warning |
| `D4_single_direction_run` | one direction 0 trades — no cross-direction comparison | note |
| `D5_noisy_distribution` | R_DIST_V2 has > 4 non-empty buckets all below 25% — no concentration | note |

### Confidence Levels

```
high   — rule fires on a structural metric with N well above threshold (robust pattern)
medium — rule fires but N is close to threshold or metric is volatile
low    — informational, directional only, do not treat as edge confirmation
warning — data-quality / interpretation caveat, not a performance insight
```

### Sample-Size Guards

- Global gate: `validTradeCount < 15` → emit only `D1_low_sample`, suppress A/B/C rules
- Per-rule N checks: each rule specifies its own `minN` (see tables above)
- Direction-split rules: each side must independently meet `minN`
- OB-funnel rules: require `obStats.total ≥ 20`
- Monthly rules: require `MONTHLY.length ≥ 4`

### Deduplication / Priority

1. Only one A-category insight per metric (highest-confidence wins if multiple fire on same axis)
2. Only one B-category insight per metric axis (e.g. only one directional leak even if both long and short are negative — pick the worse one)
3. C-category: at most one "improved" and one "degraded" delta insight
4. D-category: always shown first regardless of other rules
5. Hard cap: 6 insights total, ordered D > B > C > A (risks first, then upside)

---

## 5. Insight Output Shape

```js
// InsightResult
{
  id:         string,        // e.g. "B2_short_losing"
  category:   "A"|"B"|"C"|"D",
  confidence: "high"|"medium"|"low"|"warning",
  title:      string,        // short label, e.g. "Short Side Leak"
  body:       string,        // evidence sentence, e.g. "Short trades: −2.3R net over 14 trades (avg −0.16R)"
  metric:     string,        // primary metric key, e.g. "netR"|"winRate"|"direction"|"obFunnel"
  value:      number|null,   // the raw number that triggered the rule (for save-finding evidence)
  threshold:  number,        // the threshold that was crossed
  n:          number,        // sample size used
  direction:  "positive"|"negative"|"neutral"|"warning",
  savePayload: {             // pre-filled for "Save Finding" flow
    title:   string,
    note:    string,
    source:  "generated_run_insight",
  }
}
```

---

## 6. MVP Insight Categories

### Priority 1 — Top Positive Edge
**Rule:** `A2_expectancy_strong` OR `A3_pf_strong` — whichever fires with higher confidence.
**Evidence:** `"Expectancy +0.42R over 28 trades · PF 2.3 · WR 58%"`
**Why first:** Most actionable confirmation the strategy is extracting edge.

### Priority 2 — Top Negative Leak
**Rule:** `B1_full_stop_concentration` OR `B2_short_losing` / `B3_long_losing` — hardest structural leak.
**Evidence:** `"Short trades: −3.1R net over 16 trades — dragging overall expectancy to +0.09R"`
**Why second:** Highest information-to-action ratio. Directs the next sweep.

### Priority 3 — Biggest Change vs Reference
**Rule:** `C1_net_r_improved` OR `C2_net_r_degraded` — the single largest confirmed delta.
**Evidence:** `"Net R improved +4.2R vs baseline · Win rate +6pp · PF +0.8"`
**Why third:** Answers "did this change help?" directly. Only shown when reference exists.

### Priority 4 — Low-Confidence Warning
**Rule:** `D1_low_sample` / `D3_unlinked_obs` / `D4_single_direction_run`
**Evidence:** `"⚠ Only 12 valid trades — all metrics are directional only"`
**Why included:** Prevents the user from misreading A/B insights on thin data. Must precede other cards.

---

## 7. UI Placement Recommendations

### Recommended: Inline Insights Panel in the Research Strip

**Location:** Inside the existing `ResearchStrip` collapsible (RunDetail lines 2107–2195), as a new child between `WhatChangedCard` and the `SaveFindingCard`/`RecentFindingsCard` grid.

**Rationale:**
- ResearchStrip is already the designated "research operation center" for the run
- It collapses, so insights don't push analytics panels down when not needed
- Proximity to `SaveFindingCard` enables a natural "I see this insight → save it as a finding" flow
- `WhatChangedCard` is already the Δ context; insights immediately below extend it

**Alternative A — Insights tab in the existing workspace**
Add an "Insights" tab alongside the Outcome Distribution panel. Works but splits insight-to-action from the finding-save flow.

**Alternative B — Floating strip above KPI strip**
Always-visible strip of 1–2 top insights (like an alert bar). Highest visibility, but high visual weight for thin-sample runs where insights should be suppressed.

**Alternative C — Separate /insights page**
Already exists at `frontend/src/pages/Insights.jsx`. Cross-run insights live here long-term, but per-run generated insights belong on RunDetail, not a separate page.

### Recommendation Summary

```
RunDetail → ResearchStrip (collapsible) → [existing: NextStep | WhatChanged] 
  → [NEW: GeneratedInsightsCard]
  → [existing: SaveFindingCard | RecentFindingsCard]
```

The `GeneratedInsightsCard` shows 2–4 insights with inline "Save as Finding" buttons per insight.

---

## 8. Save Finding Integration

### Existing Mechanism

```js
// RunDetail.jsx line 1365
const entry = addProjectFinding(projectId, {
  note:        text,       // free-text from SaveFindingCard textarea
  sourceRunId: runId,
  runId,
});
```

`addProjectFinding` writes to `project.findings[]` with shape:
```js
{
  id, createdAt, note, sourceRunId, runId,
  type: "finding",    // default
  source: undefined   // currently undefined for manual entries
}
```

`classifyFindingSource()` in projectWorkflow.js already handles three sources:
- `"table_compare"` — from Table Compare
- `"run_workspace"` — from Run Workspace manual save
- `"manual"` — legacy / untagged

### Generated Insight Save Shape

When user clicks "Save as Finding" on a generated insight, call `addProjectFinding` with:

```js
addProjectFinding(projectId, {
  // Core finding body
  note:        insight.savePayload.note,
    // e.g. "Short trades: −3.1R net over 16 trades (avg −0.19R/trade). Directional leak — Short side is dragging overall expectancy."

  // Traceability
  sourceRunId:    runId,
  runId:          runId,
  source:         "generated_run_insight",  // NEW source key — needs adding to FINDING_SOURCE_FILTERS

  // Generated metadata (for display in RecentFindingsCard / Insights page)
  generatedTitle:  insight.savePayload.title,   // e.g. "Short Side Leak"
  insightId:       insight.id,                  // e.g. "B2_short_losing"
  insightCategory: insight.category,            // "B"
  insightConfidence: insight.confidence,        // "high"
  metric:          insight.metric,              // "direction"
  value:           insight.value,               // −3.1
  n:               insight.n,                   // 16

  // Context
  projectId,
  runId,
})
```

### Required Store Change (minimal)

1. Add `"generated_run_insight"` to `FINDING_SOURCE_FILTERS` in `projectWorkflow.js`
2. Add display handling in `RecentFindingsCard` — generated findings show `generatedTitle` as bold prefix before `note`, styled with a `Lightbulb` or `FlaskConical` icon

### Generated Title & Note Templates

For each insight the engine pre-fills `savePayload`:

| Category | `title` template | `note` template |
|---|---|---|
| A1 | `"Strong Win Rate"` | `"Win rate {X}% over {N} decided trades. PF {pf}."` |
| A2 | `"Positive Expectancy"` | `"Expectancy +{X}R/trade over {N} valid trades. Net R +{net}R."` |
| A5 | `"Directional Winner: {side}"` | `"{side} produced {pct}% of net R ({R}R over {N} trades)."` |
| B1 | `"Full Stop-Out Concentration"` | `"{pct}% of losses are full −1R stop-outs ({n}/{total} losses). Review SL placement or entry depth."` |
| B2 | `"Short Side Leak"` | `"Short trades: {R}R net over {N} trades (avg {avgR}R/trade). Dragging overall expectancy."` |
| C1 | `"Net R Improved vs {refLabel}"` | `"Net R {+delta}R vs {refLabel}. Win rate {wr}% (+{deltaWR}pp). Profit factor {pf}."` |
| D1 | `"Low Sample Warning"` | `"Only {N} valid trades. All metrics are indicative only — do not promote to finding without more data."` |

---

## 9. Risks

### 9a. False Confidence
**Risk:** A rule fires at exactly the threshold (e.g. winRate = 61%, n = 21) and gets `confidence: "high"`, but the user treats this as confirmation-grade evidence.

**Mitigation:**
- Show N next to every insight body — make sample size non-optional in the display
- Use language like "over {N} trades" not "pattern confirmed"
- Never use "confirmed", "proven", or "strong edge" — use "observed", "this run shows", "directional"

### 9b. Low Sample Sizes
**Risk:** Most runs are 20–50 trades. Rules calibrated for 15+ minimum will fire on genuinely noisy data.

**Mitigation:**
- `D1_low_sample` global gate: if n < 15, suppress A/B/C, show only D warnings
- Each rule has its own `minN` — enforce at the rule check level, not just the gate level
- Consider adding `"indicative"` confidence tier below `"low"` for 10–20 trade results

### 9c. Duplicate Insights
**Risk:** User sees `B2_short_losing` and `B3_long_losing` both firing → "both sides are bad" is a contradiction (or a near-zero trade run).

**Mitigation:**
- Deduplication rule: if both directional leak rules fire, promote to `"Directional Breakdown: both sides losing"` — a single combined insight
- Never emit contradictory "positive" and "negative" for the same metric axis in the same run

### 9d. Overfitting to Run Characteristics
**Risk:** A run with `structure_filter = "bos"` only generates BOS trades, so the "structure winner" insight always fires for BOS (trivially true — it's the only structure).

**Mitigation:**
- `A6_structure_winner` requires both structures to have n ≥ `minN`. If the run is direction or structure-locked, the rule cannot fire
- Check `runConfig.structure_filter` — if not "both", suppress structure comparison insights entirely

### 9e. Noisy Buckets
**Risk:** R_DIST_V2 buckets with count=1 or count=2 produce 100% readings that look dramatic.

**Mitigation:**
- `A7_full_winners` and similar bucket rules require the relevant bucket count ≥ 5 independently, not just the pct threshold
- `D5_noisy_distribution` warning fires when no bucket exceeds 25%

### 9f. Reference Run Mismatch
**Risk:** C-category deltas compare against a reference that's on a different symbol, timeframe, or RR — the delta is meaningless.

**Mitigation:**
- Before emitting C-category insights, check that reference run shares the same `symbol` — if symbol differs, suppress C-category or add a `"cross-symbol delta"` caveat
- Ideally: also check TF match; if TF differs, downgrade confidence to `"low"`

### 9g. Double-Saving Generated Insights
**Risk:** User saves the same generated insight twice (e.g. clicks "Save" and then re-generates with same data).

**Mitigation:**
- `insightId` is stored on the finding. Before saving, check `project.findings` for an existing entry with `insightId === insight.id AND runId === current runId` — if exists, show "Already saved" state instead of re-saving.

---

## 10. Exact Implementation Prompt

> **INS-1 — Run Workspace Generated Insights Engine**
>
> **Goal:** Add a deterministic, rule-based insight generator to RunDetail. No AI, no backend. Pure `useMemo` over existing computed values.
>
> **Scope:**
> - New file: `frontend/src/lib/runInsights.js` — pure function `generateRunInsights(inputs)` returning `InsightResult[]`
> - New component: `GeneratedInsightsCard` inside `RunDetail.jsx` — renders the insight list inside ResearchStrip
> - Update `projectWorkflow.js`: add `"generated_run_insight"` to `FINDING_SOURCE_FILTERS`
> - Update `addProjectFinding` call site in `SaveFindingCard` (or new `onSaveGeneratedInsight` handler) to pass the extended payload shape
>
> **Do NOT:**
> - Modify any analytics hooks or data files
> - Add any new route or page
> - Use any LLM or async call
>
> **Rules to implement (in priority order):**
>
> Phase 1 (MVP — 4 rules):
> 1. `B1_full_stop_concentration` — pct of losses that are full −1R (≥ 75%, n ≥ 5 losses)
> 2. `A2_expectancy_strong` — expectancy ≥ 0.4R (n ≥ 15)
> 3. `B2_short_losing` / `B3_long_losing` — directional leak (netR < −1R, n ≥ 10/side)
> 4. `C1_net_r_improved` / `C2_net_r_degraded` — largest delta vs reference (n/a guard: reference must exist)
> 5. `D1_low_sample` — global gate at n < 15
>
> Phase 2 (Full MVP — adds):
> 6. `A5_directional_winner` — one side > 60% of netR
> 7. `B4_low_fill_rate` — fill rate < 28% of eligible
> 8. `B5_high_session_filter_loss` — session filter > 30% of OBs
> 9. `A8_monthly_consistency` — ≥ 70% positive months over ≥ 6 months
> 10. `D3_unlinked_obs` — ≥ 20% of filled OBs unlinked
>
> **InsightResult shape:** See §5 above — verbatim.
>
> **UI placement:** Inside `ResearchStrip`, as `<GeneratedInsightsCard insights={generatedInsights} project={project} projectId={projectId} runId={runId} />` — positioned between `WhatChangedCard` and the `SaveFinding/RecentFindings` grid.
>
> **Save Finding integration:** Per §8 — call `addProjectFinding` with the extended payload including `source: "generated_run_insight"`, `insightId`, `insightCategory`, `insightConfidence`, `metric`, `value`, `n`. Add dedup check before save.
>
> **Sample size contract:** Every rule function must accept inputs and return `null` if `minN` is not met. The outer `generateRunInsights` function applies the global `D1_low_sample` gate first, then calls each rule, then deduplicates and caps at 6 insights ordered D > B > C > A.
>
> **Reference run guard:** C-category rules must check `runReference.run !== null` and ideally that `runReference.run.symbol === run.symbol` before firing.
>
> **Existing `autoInsights` migration:** The existing `autoInsights` useMemo (RunDetail lines 934–991) outputs plain text strings with no type, confidence, or save payload. In Phase 1 these can remain as-is (they render in Outcome Distribution). The new `GeneratedInsightsCard` is additive and lives in ResearchStrip only. In Phase 2, migrate `autoInsights` logic into `runInsights.js` and remove the inline useMemo.

---

## STATUS: COMPLETE

## NEXT: Single Recommended Phase

**INS-1 Phase 1 — Implement the MVP insight engine (`runInsights.js` + `GeneratedInsightsCard`)**

Deliverables:
1. `frontend/src/lib/runInsights.js` — pure function, 5 rules, typed output shape
2. `GeneratedInsightsCard` component inside RunDetail, rendered inside ResearchStrip
3. One-line addition to `FINDING_SOURCE_FILTERS` in `projectWorkflow.js`
4. Extended `addProjectFinding` call with `source`, `insightId`, `n`, `value` metadata

Effort estimate: ~3–4 hours of implementation.
No existing files are restructured; no analytics change; no routing change.
The only risk is the dedup-before-save guard — test that `project.findings.some(f => f.insightId === id && f.runId === runId)` works correctly before the first save.
