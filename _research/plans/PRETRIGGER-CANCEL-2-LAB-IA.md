# PRETRIGGER-CANCEL-2 — Lab Architecture & Feature Placement
_FX-OB-Research-Lab · Audit + IA Design · June 2026_

> **AUDIT ONLY — no files modified, no code, no implementation.**

---

## Current Lab Responsibilities (Confirmed by Audit)

| Lab | Confirmed responsibility boundary |
|---|---|
| **OB Lab** | OB as an entity: structure type, direction, origin/detection session, width, age, penetration depth, temporal stability, invalidation/breach. Session matrix (where formed vs where filled). |
| **Entries Lab** | Entry model comparison: funnel metrics, fill behavior, trigger behavior, candle mode, model KPIs, sensitivity, MAE/MFE. Multi-model axis. |
| **Failures Lab** | Loss/failure analysis: archetypes, severity, session/direction failure rates, streaks, temporal decay, prevention rules ranked by net R delta. |
| **Strategy Map** | Visual diagnostics: chart overlays, OB boxes, lifecycle markers, RR tools, news/session bands. |
| **Run Workspace** | High-level KPI summary: win rate, net R, entry model config. No deep analytics. |

---

## Lab Ownership Map — 12 Features

---

### 1. Failed Tag Count Analysis

> Distribution of tag cycles (0 / 1 / 2 / 3+) bucketed by outcome (trigger reached / not reached / eventual fill / no fill).

**Primary: Entries Lab — Model Analysis, Trigger Behavior tier**

Failed tag count is a triggered-edge funnel metric. It extends the existing funnel one step: after "Tapped," how many complete entry/exit cycles occurred before the trigger fired? This belongs in the funnel cluster alongside TriggeredEdgeFunnelPanel, SameNextCandlePanel, and CancelReasonPanel.

**Secondary: OB Lab — Edge Discovery tab**

As an OB characteristic — how many times was this box probed before resolution? — it can sit alongside Penetration Depth Analysis as a companion table. Not the primary surface because it requires model-specific (triggered-edge) data to be meaningful.

**Rationale for keeping out of OB Lab primary:** The analysis is only answerable when triggered-edge trade rows are present. OB Lab's Model Analysis tab is model-agnostic. Penetration depth works without triggered-edge data; tag count does not.

---

### 2. Tagged but Never Triggered Analysis

> OBs where `tapped_before_trigger = true` but `trigger_time` is empty. What did price do next? Invalidation rate, session distribution, penetration depth at time of abandonment.

**Primary: Entries Lab — Model Analysis, Trigger Behavior tier**

"Never triggered" is a named bucket in the existing funnel (the TriggeredEdgeFunnelPanel already counts `neverTriggeredCount`). The full analysis — what characterises OBs that were touched but never triggered — extends that funnel bucket rather than requiring a new surface.

**Secondary: Failures Lab — Prevention tab**

If never-triggered OBs reliably avoid losses (high ghost_outcome = "never_triggered" or "invalidated"), that is a prevention signal. The Prevention Engine should surface it as a candidate rule: "OBs touched but not triggered within N candles produced X% losses if they later triggered." Promotable to Hypothesis Lab.

**Out of OB Lab:** This is a triggered-edge model artefact, not an intrinsic OB property. The OB Lab does not know about trigger thresholds.

---

### 3. Max Pre-Trigger Penetration Buckets

> Bucketing OBs by the maximum depth price reached *before* the trigger fired (or before the OB was abandoned). Outcome distribution per depth bracket: 0–10%, 10–25%, 25–50%, 50–75%, 75–100%.

**Primary: OB Lab — Edge Discovery tab**

This is a pure OB characteristic. The Edge Discovery tab already contains "Penetration Depth Analysis" (`max_ob_penetration_pct` bucketed by outcome). Pre-trigger penetration is a refinement of that existing section — either a mode toggle on the existing table or a new row group beneath it. The question "how deep did price probe this OB before the trigger fired?" is structural OB research.

**Secondary: Entries Lab — Model Analysis, Trigger Behavior tier**

From the model perspective: does a deeper pre-trigger probe predict whether the trigger fires and whether the fill wins? This is a model-level question and belongs in the triggered-edge funnel context.

**Note:** The existing OB Lab penetration table shows max penetration across the full trade lifetime. Pre-trigger penetration is a strict subset (penetration before `trigger_time`). These should be clearly labelled as distinct to avoid confusion.

---

### 4. First-Tag Session Analysis

> Which session produced the first OB touch (`tapped_time` session)? Does the session of first engagement correlate with trigger rate, fill rate, or win rate?

**Primary: OB Lab — Model Analysis tab, Session Performance group**

OB Lab's Model Analysis already has a 2×2 session grid: Origin Session and Created/Detection Session. First-Tag Session is the third natural card in that progression — it completes the OB's session story: formed in X, confirmed in Y, first touched in Z. It belongs in that grid as a third session card, gated on data availability (same conditional rendering pattern as the existing "Created Session" card).

**Secondary: Entries Lab — Model Analysis, Trigger Behavior tier**

From the model perspective: does first-tag session predict whether the trigger fires? This is an entry behavior question and belongs in the trigger analysis section.

**Naming guidance:** The three OB Lab session cards should be labelled consistently:
- "OB Origin Session" — session at `origin_time`
- "OB Detection Session" — session at `detection_time`
- "OB First-Tag Session" — session at `tapped_time` *(new)*

---

### 5. Pre-Trigger Cancellation Rule Analysis

> Per-rule counts and performance: how many OBs each rule cancelled, cancel timing, rule precision (% of cancels that avoided a loss), net R saved/lost per rule.

**Primary: Failures Lab — new "Cancellations" tab** *(see §B below)*

Cancellation rule analysis is prevention analysis — it asks "was the decision to cancel correct?" The Failures Lab Prevention Engine already uses this exact framework: rules ranked by net R delta, confidence tiers, hypothesis promotion. Pre-trigger cancel rules are a new category of prevention candidate. The Cancellations tab extends Prevention into the counterfactual direction.

**Secondary: Entries Lab — Model Analysis, CancelReasonPanel**

The existing CancelReasonPanel already handles `retrace_cancel_reason` breakdowns. When pre-trigger cancel data is present, it can extend to show pre-trigger cancel reasons alongside retrace cancels. This is secondary because it shows rule distribution only — not the full precision/net R analysis.

---

### 6. Ghost Win / Ghost Loss Tracking

> Per-cancelled-OB records of what would have happened: ghost outcome (win/loss/be/protection_exit/unfilled/never_triggered), ghost R, time from cancel to ghost fill.

**Primary: Failures Lab — new "Cancellations" tab**

Ghost outcomes are the core output of cancellation research. They answer: "of the OBs we cancelled, were we cancelling losers or winners?" This is drilldown-level analysis on cancellation decisions and belongs in the dedicated Cancellations tab alongside the rule breakdowns.

**Secondary: Entries Lab — Model Analysis, Trigger Behavior tier**

Ghost win/loss counts can appear as a summary row in the triggered-edge funnel — after the "Cancelled" bucket, show ghost outcome split. This keeps the funnel complete without duplicating the full drilldown.

**Out of OB Lab:** Ghost outcomes require knowing the hypothetical trade result. OB Lab does not operate on trade results in that way — it uses actual outcomes.

---

### 7. Ghost Net R Saved Metrics

> `pretrigger_net_r_saved` — net R impact of cancellation after accounting for wins missed and losses avoided. The single-number verdict.

**Primary: Run Workspace — Entry Model KPI card**

This is a run-level summary metric: "did pre-trigger cancellation help this run?" It is high-level, non-drilldown, and belongs in the Run Workspace alongside the existing reverse_cancels count and news_blackout_skipped summary fields. Show when the run has `pretrigger_cancels_total > 0`.

**Secondary: Failures Lab — Cancellations tab**

The Cancellations tab shows ghost net R at the per-rule granularity. Rule A saved +2.1R; Rule B cost −0.4R. The Run Workspace shows only the aggregate.

**Secondary: Entries Lab — Model Analysis, ModelKPIStrip**

The KPI strip for a triggered-edge model should surface Ghost Net R as a chip, gated on data availability, alongside the existing Trigger Rate / Fill Rate chips.

---

### 8. Cancel Rule Breakdowns

> Which rule fired for each cancelled OB; rule activation counts by threshold setting; timing distributions; comparison of rule outputs side by side.

**Primary: Failures Lab — new "Cancellations" tab**

Rule breakdowns require a dedicated surface to show rule counts, precision, and parameter sensitivity side by side. The existing Prevention Engine tab is the architectural parent — Cancellations inherits its ranking/confidence pattern.

**Secondary: Entries Lab — Model Analysis, CancelReasonPanel**

The existing CancelReasonPanel can be extended to show pre-trigger cancel rule reasons as a new category alongside retrace cancel. This is the compact, model-level view; the Cancellations tab is the deep-dive.

---

### 9. Cancelled OB Visual Markers

> Chart overlay: ⊘ marker at `ob_pretrigger_cancel_time`, on the OB edge price. Shows when and where each cancel rule fired on the chart.

**Primary: Strategy Map — lifecycle overlay layer**

Visual diagnostics are Strategy Map only. The cancel marker is a new lifecycle point marker consistent with the existing `tapped` / `triggered` / `armed` / `retrace_cancel` / `edge_revisit` marker set defined in the TRIGGERED_EDGE_AUDIT design. It should be a togglable layer (default on, since it is the primary event being researched).

**No secondary.** This is chart-only.

---

### 10. Ghost Fill Visual Markers

> Chart overlay: ◌ (hollow circle) at `ob_ghost_fill_time`, at the hypothetical fill price. Shows where a cancelled OB would have filled.

**Primary: Strategy Map — ghost overlay layer**

Same surface as above. The ghost fill marker is a distinct visual layer — intentionally rendered differently (hollow, muted gray) to communicate "this did not happen." Should default **off** — ghost markers on every cancelled OB create significant chart noise. Enable per-selected-trade or as a togglable layer.

**No secondary.**

---

### 11. OB Creation Session Performance

> Performance bucketed by the session in which the OB forming candle originated (`ob_origin_session` / `origin_time`).

**Finding: Already exists.** OB Lab Model Analysis tab has an "Origin Session" `TableCompareShell` in the 2×2 session grid. This IS the OB Creation Session card.

**Recommendation:** Do not add a duplicate. Rename from "Origin Session" to "OB Origin Session" for clarity and to distinguish it more clearly from "Created Session" (detection). The card is already permanent and already in the right place.

**The question of permanence:** Both Origin Session and Detection Session should be permanent cards — the 2×2 layout should always show all four slots. The Detection Session card already uses a conditional unavailable state for runs where `obDetectionTime` is absent; that pattern is correct. No structural change needed, only labelling.

---

### 12. OB Detection Session Performance

> Performance bucketed by the session in which the OB was confirmed via structure break (`ob_detection_session` / `detection_time`).

**Finding: Already exists.** OB Lab Model Analysis tab has a "Created Session" `TableCompareShell` that uses `analytics.createdSessionRows` from `obDetectionTime`. It renders an unavailable state when the field is absent.

**Recommendation:** Rename "Created Session" → "OB Detection Session." "Created" is ambiguous — it sounds like origin time, not detection time. "Detection Session" is unambiguous. This is a naming fix, not a structural change.

**Elevation:** This card is already in the permanent 2×2 grid. No elevation needed. The unavailable state correctly handles runs without detection data.

---

## Ownership Summary Table

| Feature | Primary | Secondary |
|---|---|---|
| 1. Failed Tag Count Analysis | Entries Lab — Trigger Behavior tier | OB Lab — Edge Discovery |
| 2. Tagged but Never Triggered | Entries Lab — Trigger Behavior tier | Failures Lab — Prevention |
| 3. Max Pre-Trigger Penetration Buckets | OB Lab — Edge Discovery | Entries Lab — Trigger Behavior tier |
| 4. First-Tag Session Analysis | OB Lab — Model Analysis, Session group | Entries Lab — Trigger Behavior tier |
| 5. Pre-Trigger Cancellation Rule Analysis | Failures Lab — Cancellations tab | Entries Lab — CancelReasonPanel extension |
| 6. Ghost Win / Ghost Loss Tracking | Failures Lab — Cancellations tab | Entries Lab — funnel summary row |
| 7. Ghost Net R Saved Metrics | Run Workspace — KPI card | Failures Lab — Cancellations; Entries Lab — KPI strip |
| 8. Cancel Rule Breakdowns | Failures Lab — Cancellations tab | Entries Lab — CancelReasonPanel extension |
| 9. Cancelled OB Visual Markers | Strategy Map | — |
| 10. Ghost Fill Visual Markers | Strategy Map | — |
| 11. OB Creation Session Performance | OB Lab — already exists as "Origin Session" | — |
| 12. OB Detection Session Performance | OB Lab — already exists as "Created Session" | — |

---

## Section A — Entries Lab: Clean IA for Triggered Edge Research

### Current Model Analysis tier structure

```
1. KPI strip
2. ExactResultsPanel (all models)
3. [Lifecycle tier] TriggeredEdgeFunnelPanel · SameNextCandlePanel · CancelReasonPanel
   — gated: only renders when triggered-edge row is selected
4. Decision Analytics tier: EquityCurve · TradeOff · MAE · Direction · SessionMatrix · Sensitivity · Pareto
5. Advanced Research shell: DominanceMatrix · heatmaps · TradeDiffExplorer · lifecycle/backlog
```

### Proposed addition: "Trigger Behavior" tier

Insert a new named tier between the existing lifecycle funnel row (item 3) and Decision Analytics (item 4). The Trigger Behavior tier only renders when a triggered-edge model is selected and when the relevant data fields are present.

```
1. KPI strip
2. ExactResultsPanel (all models)
3. [Lifecycle tier — existing]
   TriggeredEdgeFunnelPanel · SameNextCandlePanel · CancelReasonPanel
   ─── TierDivider: "Trigger Behavior" ──────────────────────────────
4. [Trigger Behavior tier — NEW, gated on triggered-edge selection]
   Failed Tag Count breakdown
   Tagged-but-never-triggered breakdown (funnel bucket drill)
   Pre-trigger penetration × outcome table
   First-tag session × outcome matrix
   Cancel rule performance (gated: only when cancel data present)
5. Decision Analytics tier: EquityCurve · TradeOff · MAE · Direction · SessionMatrix · Sensitivity · Pareto
6. Advanced Research shell (existing)
```

**Naming discipline:** The existing tier divider pattern ("Decision Analytics · Equity · Direction · Session · MAE/MFE") already exists in ModelAnalysis.jsx as `TierDivider`. The new tier follows the same pattern: `TierDivider label="Trigger Behavior" sub="Tag cycles · penetration · session · cancel"`.

**Gating rule:** The entire Trigger Behavior tier is hidden when:
- The selected model is not a triggered-edge family key
- `tapped_before_trigger` field is absent from trade rows

This prevents the tier from rendering empty sections for baseline or penetration models.

**CancelReasonPanel placement:** The existing CancelReasonPanel sits in the lifecycle funnel row (item 3). It shows retrace cancel reasons. When pre-trigger cancel data is present, CancelReasonPanel should grow to show both retrace-cancel and pre-trigger cancel categories in one panel — rather than having two separate cancel panels. Keep it in item 3, extend it.

---

## Section B — Failures Lab: Clean IA for Cancellation and Ghost Outcome Research

### Current tab structure

```
Overview · DNA & Archetypes · Temporal · Direction · Sessions · Streaks · Prevention · Drilldown · Views & Export
```

### Proposed addition: "Cancellations" tab

Insert between Prevention and Drilldown:

```
Overview · DNA & Archetypes · Temporal · Direction · Sessions · Streaks · Prevention · Cancellations · Drilldown · Views & Export
```

**Why a new tab rather than adding to Prevention:**

Prevention is about losses from fills — "what patterns in winning setups appeared before losses?" It asks "should we have avoided this trade?"

Cancellations is about counterfactual decisions — "we chose not to fill; were we right?" The unit of analysis is different: Prevention operates on filled trades, Cancellations operates on cancelled candidates. Mixing them in one tab conflates two distinct questions and adds unrelated sections to Prevention.

**Cancellations tab structure:**

```
[Section 1 — Cancel Rule Overview]
  Total cancels · Ghost trigger rate · Ghost fill rate
  Losses avoided · Wins missed · Net R saved (summary chips)

[Section 2 — Rule Breakdown Table]
  Per-rule rows: rule name · cancels · losses avoided · wins missed · net R delta · precision pct
  Sortable by: net R delta (default) · precision · cancel count
  Confidence tier tag (STRONG / MODERATE / WEAK / SPECULATIVE) using same framework as Prevention

[Section 3 — Ghost Outcome Distribution]
  Bar: Win missed / Loss avoided / BE / Unfilled / Never triggered / Invalidated
  Per-rule breakdown (expandable rows)

[Section 4 — Ghost Fill Timing]
  Distribution: candles from cancel to ghost fill
  Median · P25 · P75 labels
  Insight: "50% of ghost fills occurred within N candles — suggests rule fires too early"

[Section 5 — Cancel Rule Comparison]
  Side-by-side rule comparison: Rule A vs Rule B vs Rule C
  Same ExactResults-style table structure, one row per rule
  Promotable to Hypothesis Lab (same "Promote" button pattern as Prevention Engine)
```

**Gating:** The entire Cancellations tab is hidden when `pretrigger_cancels_total = 0` or the trades have no `ob_pretrigger_cancelled = true` rows. A "no cancel data" empty state is shown with an explanation: "Run a triggered-edge backtest with pre-trigger cancel rules enabled to populate this tab."

**Prevention vs Cancellations boundary:**

| Responsibility | Prevention | Cancellations |
|---|---|---|
| Unit of analysis | Filled losing trades | Cancelled pre-trigger OBs |
| Primary question | "Should we have avoided this?" | "Was the cancel decision correct?" |
| Input data | `losers` (filled trades) | `ob_pretrigger_cancelled = true` rows |
| Net R framing | Losses avoided if we'd skipped | Ghost R saved by not filling |
| Hypothesis bridge | Yes | Yes — same promote pattern |

---

## Section C — OB Creation and Detection Session Cards

### Current state

| Card | Label | Source field | Location |
|---|---|---|---|
| Origin Session | "Origin Session" | `obOriginSession` / `origin_time` | OB Lab → Model Analysis → 2×2 grid, slot 3 |
| Detection Session | "Created Session" | `obDetectionTime` / `detection_time` | OB Lab → Model Analysis → 2×2 grid, slot 4 |

### Recommendation

Both cards should be permanent. No structural change to the 2×2 grid is needed. Two labelling fixes are recommended:

**Rename slot 3:** "Origin Session" → **"OB Origin Session"**
Makes the session concept explicit — this is the session when the candle that became the OB occurred.

**Rename slot 4:** "Created Session" → **"OB Detection Session"**
"Created" is ambiguous (it reads like origin time). "Detection" is unambiguous — this is when the structure break confirmed the OB.

**Do not add a third "OB Creation Session" card.** There is no third meaningful creation event that is not already covered by Origin (candle formed) and Detection (structure confirmed). A "First-Tag Session" card (feature 4 above) is the correct third card to add — but it belongs as a fifth slot or as an additional row below the 2×2 grid when first-tag data is available, not as a replacement for any existing card.

**Updated 2×2 grid labels:**

```
Row 1: [OB Origin Session]        [OB Detection Session]
Row 2: [BOS vs CHoCH]             [Long vs Short]
```

Or reordered to group session cards together more clearly:

```
Row 1: [OB Origin Session]        [OB Detection Session]
Row 2: [BOS vs CHoCH]             [Long vs Short]
```

A fifth session card — **"OB First-Tag Session"** — appears below the grid when `ob_first_tag_time` data is present, using the same conditional rendering and unavailable-state pattern as Detection Session currently uses.

---

_End of PRETRIGGER-CANCEL-2 lab architecture audit. No files modified._
