# Entries Lab V2 — Architecture Audit & Product Design

> **Mode:** AUDIT + DESIGN ONLY. No implementation. No file edits.  
> **Date:** 2026-05-28  
> **Scope:** Entries Lab frontend architecture review and V2 product specification.

---

## 1. Files Read

| File | Purpose |
|------|---------|
| `EntriesWorkspace.jsx` | Root workspace component, data wiring, tab routing |
| `analytics/entryRegistry.js` | Model registry, family definitions, sample confidence |
| `analytics/entryAnalytics.js` | Core analytics: row building, funnels, direction split, highlights |
| `model/ModelAnalysis.jsx` | Main analysis tab — panel layout and tiers |
| `model/ModelKPIStrip.jsx` | KPI chip row for selected model |
| `model/ExactResultsPanel.jsx` | Master results table grouped by family |
| `model/DirectionPanel.jsx` | Long/short direction asymmetry table |
| `model/DominanceMatrix.jsx` | Cross-model heatmap scoring grid |
| `model/SensitivityPanel.jsx` | Penetration sensitivity curve (threshold vs Net R) |
| `model/LifecycleBacklogPanels.jsx` | Static registry display + research backlog |
| `shared/useEntryWorkspace.js` | Tab state, global filters, column visibility, model selection |

---

## 2. Current Entries Lab Architecture

### Workspace Structure

The workspace root (`EntriesWorkspace.jsx`) owns all data and passes it downward via a single `sharedProps` bundle. The flow is:

```
useDataset() → ACTIVE_RUN, TRADES
    ↓
resolveEntryResults(activeRun)         → entryResults (summary + tradesByMode)
buildEntryResultRows(run, trades)      → exactRows[]   (flat array, all families)
buildExactSummary(exactRows)           → summary       (global best-of winners)
buildEntryAnalytics(trades, exactRows) → analytics     (session/hour/direction/matrix)
    ↓
sharedProps → all five tabs
```

**Tabs (5):**
- `model-analysis` → `ModelAnalysis` — the primary analysis view
- `experiment-compare` → `ExperimentCompare` — cross-run comparison
- `entry-hypotheses` → `EntryHypothesisLab` — hypothesis testing
- `robustness` → `RobustnessLab` — rolling/confidence metrics
- `promotion` → `PromotionDesk` — model promotion workflow

Global filters (session, direction) sit above tabs and apply to the `filteredTrades` list used by all tabs.

---

### Registry Structure (`entryRegistry.js`)

`PLANNED_ENTRY_MODES` is a flat array of model descriptors. Each has:

```js
{
  mode: "entry_triggered_edge_25p0_same",
  label: "Trigger 25% → Edge entry · same candle",
  family: "Triggered Edge",    // string key only — no type semantics
  threshold: "25% same",
  status: "tested"
}
```

`ENTRY_FAMILIES` provides display color and label for each family key. There is no `familyType`, no `metricsProfile`, and no `supportedDimensions`. The family field is purely cosmetic — it drives the collapsible section headers in `ExactResultsPanel` and the color chips in `LifecyclePanel`, nothing else.

`sampleConfidence(n)` is a global threshold function (10 / 30 / 50) applied uniformly to all families. A Triggered Edge model with 15 fills is treated the same as a Penetration model with 15 fills, even though the semantics of "fill" differ.

---

### Row Building (`entryAnalytics.js`)

**`buildEntryResultRows(run, trades)`** produces a flat `exactRows` array ordered by `PLANNED_ENTRY_MODES` registry order. For each planned mode it either:
- Returns a baseline row (hardcoded: `fills = eligible = list.length`, `fillPct = 100%`)
- Returns a `entryRowFromSummary()` row if Python summary data or per-mode trades exist
- Skips the mode entirely if no data

All rows, regardless of family, share the same shape:

```
mode, label, family, threshold,
eligible, fills, fillPct,
wins, losses, winRate,
netR, expectancy, maxDD, profitFactor,
avgMAE, avgMFE, avgTimeToTP, avgTimeToSL,
deltaVsBaseline,
// triggered-edge only (null for others):
triggeredEdgeFunnel, triggerRate, fillAfterTriggerRate,
retraceCancelCount, sameCandleCount, nextCandleCount, avgTriggerToEntry
```

Triggered-edge-specific fields are appended to the same flat row object and are `null` for non-lifecycle models. There is no type branching at the row level — all models are rows of the same shape.

**`buildTriggeredEdgeFunnel(trades)`** correctly computes all funnel stages (eligible → tapped → triggered → armed → filled / cancelled-after-trigger). However, this funnel object is attached to the row as `row.triggeredEdgeFunnel` and **never rendered in a dedicated panel**. It exists in the data layer but is invisible in the UI.

---

### Highlight & Summary Logic

**`markHighlights(rows)`** runs across every `exact` row regardless of family:

```
bNet  = bestBy(all_exact_rows, "netR")        → BEST R
bExp  = bestBy(all_exact_rows, "expectancy")  → BEST EXP
loDD  = bestByLowest(all_exact_rows, "maxDD") → LOW DD
bFill = bestBy(all_exact_rows, "fillPct")     → BEST FILL
bPF   = bestBy(all_exact_rows, "profitFactor")→ BEST PF
```

**`buildExactSummary(rows)`** returns a single global winner for each dimension — `bestModel`, `bestDelta`, `bestFill`, `lowestDD`, `bestPF`.

Both operate entirely across family boundaries. There is no per-family best-of computation anywhere in the codebase.

---

### Display Layer

**`ModelKPIStrip`:** Shows KPI chips for the currently selected model (or first non-baseline row). Conditionally appends triggered-edge chips when `row.mode.startsWith("entry_triggered_edge")`. Still shows `Fill Rate` for all model types without any label disambiguation — a triggered-edge fill rate (fills/eligible) is displayed identically to a penetration fill rate (fills/eligible), even though their numerators and denominators have different meanings.

**`ExactResultsPanel`:** Groups rows by family (collapsible). Uses a single shared column grid. Triggered-edge columns (`Trig%`, `Fill/Trig`, `T→Fill`, `Same/Next`) are opt-in toggles in the column visibility toolbar — they appear as empty dashes (`—`) for non-triggered-edge rows. This design works for a table but creates visual noise and makes it impossible to do triggered-edge-specific analysis in isolation.

**`DominanceMatrix`:** Scores all models on nine dimensions including `fillPct`. Fill rate from a Triggered Edge model (e.g., 40% of setups that triggered then filled at edge) is scored on the same axis as fill rate from a Penetration model (e.g., 70% of setups that reached the 25% level). These are different things. The matrix will score them as if they're comparable.

**`SensitivityPanel`:** Hardcodes penetration family via `String(r.mode).startsWith("entry_penetration")`. Only shows the threshold-vs-Net-R curve for penetration variants. There is no equivalent curve for triggered-edge trigger-threshold sensitivity.

**`DirectionPanel`:** Shows a flat list of all models with Long / Short columns. Works correctly at the per-model level but there is no cross-model summary — no "best long model overall" recommendation, no "best short model overall" card, no warning if a specific model is heavily biased to one direction.

**`LifecyclePanel`:** Static display of `PLANNED_ENTRY_MODES` from the registry. No data-driven content. The funnel data that exists on triggered-edge rows is completely unused by this panel.

---

## 3. Architectural Problems

### Problem 1: The Denominator Illusion

This is the most critical structural problem. The three current families count "fills" against fundamentally different denominators:

| Family | Eligible | Fills Means | Fill% Means |
|--------|---------|-------------|-------------|
| Baseline | All trades in window | All setups (always 100%) | Always 100% — hardcoded |
| Penetration | All setups | Setups where price reached X% depth | What % of setups entered deeper than edge |
| Triggered Edge | All setups | Setups where trigger fired AND edge was revisited | What % of setups completed the full funnel |

When `markHighlights()` awards `BEST FILL` to a Triggered Edge model with 80% fill-after-trigger, it is comparing that 80% against a Penetration model's 60% fill-at-25%-depth. These numbers are not on the same scale. A user reading this will draw incorrect conclusions.

### Problem 2: Cross-Family Highlights Are Misleading

`BEST R` and `BEST EXP` highlights across all families appear valid but are actually misleading. A Triggered Edge model's Net R is computed only on the subset of setups that actually triggered and entered. A Penetration model's Net R is computed on all setups that reached the penetration level. If the Triggered Edge model filters to only high-quality setups before entering, its Net R will look better not because it's a better entry philosophy but because it uses a different eligible universe.

### Problem 3: The Funnel Is Built But Never Shown

`buildTriggeredEdgeFunnel()` correctly models the full lifecycle:
- eligible → tapped → triggered → armed → filled / cancelled-after-trigger
- retrace cancel count, same vs next candle, avg trigger-to-entry time

All of this data is attached to triggered-edge rows in `triggeredEdgeFunnel`. But there is no panel in the current UI that renders it as a visual funnel or waterfall. The data exists but is invisible. The current `LifecyclePanel` only shows static registry content.

### Problem 4: No Per-Family Best-of Logic

`buildExactSummary()` and `markHighlights()` only produce global winners. There is no concept of "best Penetration model" or "best Triggered Edge model." A user wanting to know the best variant within a family has to manually scan the table.

### Problem 5: Direction Analysis Has No Synthesis Layer

`DirectionPanel` correctly computes Long and Short stats per model. But there is no synthesis on top of it:
- No "best long model" recommendation card
- No "best short model" recommendation card
- No model-by-direction matrix that lets you see Long R vs Short R for all models simultaneously
- No warning when a direction has under N trades
- No support for analyzing "should longs use Model A while shorts use Model B"

This is a table, not an analytical tool.

### Problem 6: `DominanceMatrix` Mixes Incommensurable Metrics

The matrix scores `fillPct` across all model families. As shown above, this comparison is invalid across family lines. The matrix also includes `deltaVsBaseline` (penetration-specific concept) as a scoring dimension for triggered-edge models where the "delta vs baseline" means something different because the entry universe differs.

### Problem 7: Registry Has No Type Semantics

`entryRegistry.js` has `family: "Triggered Edge"` as a string, but no machine-readable signal that this family requires lifecycle/funnel analytics, that its metrics profile differs from penetration, or what dimensions are valid for it. Any component that wants to branch on family type must do so with string comparisons like `startsWith("entry_triggered_edge")`, which are scattered across:
- `entryAnalytics.js` (3 places)
- `ModelKPIStrip.jsx` (1 place)
- `ExactResultsPanel.jsx` (3 places)

Adding a new family in the future requires finding and updating all of these scattered checks.

### Problem 8: `SensitivityPanel` Is Penetration-Only With No Equivalent for Other Families

The penetration sensitivity curve (threshold vs Net R) is a genuinely useful visualization. But there is no equivalent for Triggered Edge — a trigger-threshold sensitivity chart showing how trigger% changes with 10/25/50/75% thresholds, or how same-vs-next candle mode affects performance. These are the natural "sensitivity" dimensions for the Triggered Edge family and they don't exist.

### Problem 9: `buildMatrixRows()` Is Hardcoded by Family Name

```js
function buildMatrixRows(exactRows, wins, losses) {
    const penetration   = exactRows.filter(r => r.exact && String(r.mode).startsWith("entry_penetration"));
    const triggeredEdge = exactRows.filter(r => r.exact && String(r.mode).startsWith("entry_triggered_edge"));
    return [
        { label: "Baseline", ... },
        ...penetration.map(...),
        ...triggeredEdge.map(...),
        { label: "Confirmation", fills: null, ... status: "Awaiting exporter" },
        { label: "Lifecycle Cancel", fills: null, ... status: "Architecture only" },
    ];
}
```

This hardcodes Confirmation and Lifecycle Cancel as placeholder rows. Adding a new family requires editing this function. It also hardcodes the matrix structure in the analytics layer rather than deriving it from the registry.

---

## 4. Proposed Entries Lab V2 Page Structure

### Navigation

Replace the current flat tab bar with a two-tier navigation:

**Top level (primary tabs):**
```
Overview | Family Deep Dive | Direction | Funnel | Cross-Family | Robustness | Compare | Promotion
```

**Secondary nav (contextual):** appears inside tabs that have sub-views (e.g., Family Deep Dive shows a family selector within the tab).

---

### Tab A: Overview / Model Families

The landing view. Never shows a raw results table by default — shows synthesized intelligence.

**Section 1 — Family Summary Cards (3 cards, horizontal)**

One card per active family (families with data). Each card shows:
- Family name + color badge
- Model count in family
- Best model in family (by net R)
- Best model net R vs baseline delta
- Direction split summary (e.g., "Longs: +4.2R | Shorts: +1.1R")
- Sample confidence badge
- CTA: "Deep Dive →"

**Section 2 — Recommendation Matrix (4 winner cards)**

| Card | Shows |
|------|-------|
| Best Net R | Winner across all families, family badge, sample N |
| Best Expectancy | Winner, family badge, sample N |
| Best Long Model | Best model by Long Net R + direction count |
| Best Short Model | Best model by Short Net R + direction count |

Low-sample warning appears inside any card where N < 30.

**Section 3 — Cross-Family Headline Numbers (compact strip)**

A single-row strip showing, for each family: Best Net R in family, Eligible count, Fill context (with correct label per family type). This is explicitly normalized — penetration shows "Fill @ Level", triggered edge shows "Fill After Trigger", baseline shows "Edge Touch."

---

### Tab B: Family Deep Dive

A family selector (segmented buttons: Baseline | Penetration | Triggered Edge | Confirmation) controls the entire view below it.

**Baseline section:**
- Single row. Not much to deep-dive. Show direction split, session split, equity curve, MAE/MFE.
- "This is your reference. All other families are compared against it."

**Penetration section:**
- Variant comparison table (10% / 25% / 50% / 75%)
- Sensitivity curve: threshold → Net R, Fill Rate, Expectancy
- Delta vs baseline column prominent
- Best penetration threshold recommendation card
- Direction split table (longs vs shorts per threshold)
- "Missed winners / avoided losers" trade-off panel (already exists — wire it here per family)

**Triggered Edge section:**
- Funnel waterfall panel (see Tab D for detail — or embed a compact version here)
- Variant comparison table (same/next × 10/25/50/75 when data available)
- Sensitivity curve: trigger threshold → Net R, trigger rate, fill-after-trigger rate
- Same vs Next candle breakdown bar
- Cancel reason breakdown
- Direction split per variant
- Avg trigger-to-entry distribution

**Confirmation section (future):**
- Placeholder with "Coming: requires exporter support for confirmation events."
- Show backlog items relevant to this family.

---

### Tab C: Direction Split

A dedicated tab for long/short analysis. Structure:

**Section 1 — Direction Overview Strip**
Two side-by-side KPI columns: LONGS | SHORTS
For each: total trades, net R, win rate, expectancy, profit factor.

**Section 2 — Model × Direction Matrix**

A grid: rows = models, columns = Long Net R / Short Net R / Long WR / Short WR / WR Delta / Recommendation.

The "Recommendation" column shows:
- "Strong Long" if Long exp > Short exp by meaningful threshold
- "Strong Short" if opposite
- "Balanced" if similar
- "⚠ Low N" if either direction has < 15 trades

**Section 3 — Best Model Cards (2 cards)**

```
┌──────────────────────────┐   ┌──────────────────────────┐
│  BEST LONG ENTRY MODEL   │   │  BEST SHORT ENTRY MODEL  │
│  Triggered Edge 25% Next │   │  Penetration 10%         │
│  Long Net R: +6.2R       │   │  Short Net R: +4.8R      │
│  Long WR:    62%         │   │  Short WR:    58%         │
│  N = 34 (MODERATE)       │   │  N = 28 (LOW N)           │
└──────────────────────────┘   └──────────────────────────┘
```

**Section 4 — Mixed Model Design Preview** *(read-only, no execution)*

A forward-looking UI that displays "If you used Model A for longs and Model B for shorts, projected combined net R would be X." This is a simulation display only — actual mixed-model execution is not implemented yet but the UI prepares the user for this future feature.

Inputs: Long model selector + Short model selector → combined simulation output row.

---

### Tab D: Lifecycle / Funnel (Triggered Edge + future lifecycle models)

Only relevant for `familyType: "lifecycle_trigger"` models. Can be hidden or show a "No lifecycle models have data yet" state for other families.

**Section 1 — Funnel Waterfall**

A visual waterfall/sankey for the selected triggered-edge variant:

```
Eligible Setups      ████████████████████  120
         ↓
Tapped OB Edge       ████████████████░░░░   98  (81.7%)
         ↓
Trigger Fired        ██████████░░░░░░░░░░   62  (63.3% of tapped)
         ↓
Armed (limit placed) █████████░░░░░░░░░░░   58  (93.5% of triggered)
         ↓
Filled               ███████░░░░░░░░░░░░░   44  (75.9% of triggered)
Cancelled After Trig ██░░░░░░░░░░░░░░░░░░   14  (22.6% of triggered)
Never Triggered      ████░░░░░░░░░░░░░░░░   36  (29.2% of eligible)
```

A variant selector above the waterfall allows switching between same/next candle modes and different trigger thresholds.

**Section 2 — Same vs Next Candle Breakdown**

Side-by-side comparison of same-candle fills vs next-candle fills:
- Count, Net R, Win Rate, Expectancy, Avg time to trigger
- Are same-candle fills higher quality? Lower quality? The data tells the story.

**Section 3 — Cancel Reason Breakdown**

Bar chart or table: retrace cancel, structural invalidation, time decay (future), never triggered, other.

**Section 4 — Trigger Sensitivity Chart**

Available once multiple threshold variants have data: trigger threshold (10/25/50/75%) vs trigger rate, fill-after-trigger rate, and Net R. The "at what trigger depth does performance peak?" question answered visually.

---

### Tab E: Cross-Family Comparison

The most analytically dangerous tab — shown with explicit denominator transparency.

**Section 1 — Denominator Disclosure Banner**

A persistent banner at the top:
> "These models enter at different points in a setup's lifecycle. Metrics are normalized to their own eligible universe — they cannot be compared by raw fill rate. Use Net R and Expectancy for cross-family comparison."

**Section 2 — Normalized Comparison Table**

Columns: Family | Best Model | Net R (best) | Expectancy (best) | Max DD (best) | Eligible N | Note

The "Note" column always shows the family's eligible universe description (e.g., "All setups that reached 25% OB depth" vs "All setups that triggered AND edge-revisited").

Fill rate is **not shown** in this table. Net R and Expectancy are the only valid cross-family metrics.

**Section 3 — Equity Curve Overlay**

Overlay equity curves for best-of-family models. The X-axis must be trade number (not time) and uses each model's own filled-trade sequence. Denominators are explicitly labelled.

**Section 4 — Trade-off vs Baseline**

One row per non-baseline model: "Compared to baseline, this model missed X winning setups (−Y R) and avoided Z losing setups (+W R). Net impact: +/− R."

This is already implemented in `TradeOffPanel` — wire it here at the cross-family level.

---

### Tabs F–H (Keep Existing, Enhance)

- **Robustness Lab** — keep as-is, add family selector so you can run robustness analysis per family
- **Experiment Compare** — keep as-is
- **Promotion Desk** — keep as-is, add family badge to promotion cards

---

## 5. Registry / Schema Proposal

### Enhanced `PLANNED_ENTRY_MODES` Schema

```js
{
  // existing fields
  mode: "entry_triggered_edge_25p0_same",
  label: "Trigger 25% → Edge entry · same candle",
  family: "Triggered Edge",
  threshold: "25% same",
  status: "tested",

  // NEW: machine-readable type semantics
  familyType: "lifecycle_trigger",
  // ^ one of: "edge_touch" | "level_entry" | "lifecycle_trigger" | "confirmation_entry"

  metricsProfile: "triggered_edge",
  // ^ one of: "standard" | "penetration" | "triggered_edge" | "confirmation"
  // Controls which KPI chips render, which table columns show, which panels activate

  eligibleDescription: "All setups in window",
  // ^ Human-readable description of what "eligible" means for this model family
  fillDescription: "Filled after trigger fired and edge revisited",
  // ^ Human-readable description of what "filled" means

  supportedDimensions: ["direction", "session", "threshold", "same_candle_mode", "cancel_mode"],
  // ^ Which filter/split dimensions are valid for this model
  // "threshold" = can be compared across threshold variants
  // "same_candle_mode" = has same vs next candle distinction
  // "cancel_mode" = has retrace cancel as a tracked dimension

  sensitivityAxis: "trigger_threshold",
  // ^ For families where threshold sensitivity makes sense: what axis to plot
  // "penetration_depth" for Penetration family
  // "trigger_threshold" for Triggered Edge family
  // null for Baseline

  requiresLifecycleFunnel: true,
  // ^ Whether to render the funnel waterfall panel for this model
}
```

### `ENTRY_FAMILIES` Enhancement

```js
{
  key: "Triggered Edge",
  label: "Triggered Edge",
  color: "hsl(var(--success))",
  familyType: "lifecycle_trigger",
  metricsProfile: "triggered_edge",
  description: "Enter at OB edge only after price has penetrated X% into OB and retracted.",
  validCrossModelMetrics: ["netR", "expectancy", "maxDD", "profitFactor"],
  // ^ Metrics valid for cross-family comparison
  invalidCrossModelMetrics: ["fillPct"],
  // ^ Metrics NOT valid for cross-family comparison — shown with warning if compared
}
```

### `METRICS_PROFILES` (new constant)

```js
export const METRICS_PROFILES = {
  standard: {
    kpiChips: ["netR", "expectancy", "winRate", "profitFactor", "maxDD", "fills", "delta"],
    tableColumns: ["eligible", "fills", "fillPct", "wins", "losses", "winRate", "netR", "expectancy", "maxDD", "delta"],
    fillLabel: "Fill %",
    fillDenominator: "setups",
  },
  penetration: {
    kpiChips: ["netR", "expectancy", "winRate", "profitFactor", "maxDD", "fills", "fillAtLevel", "delta"],
    tableColumns: ["eligible", "fills", "fillPct", "wins", "losses", "winRate", "netR", "expectancy", "maxDD", "delta"],
    fillLabel: "Fill @ Level",
    fillDenominator: "setups reaching penetration level",
  },
  triggered_edge: {
    kpiChips: ["netR", "expectancy", "winRate", "profitFactor", "maxDD", "fills", "triggerRate", "fillAfterTrigger", "avgTriggerToEntry", "sameNext"],
    tableColumns: ["eligible", "triggerRate", "fillAfterTrigger", "wins", "losses", "winRate", "netR", "expectancy", "maxDD"],
    fillLabel: "Fill After Trigger",
    fillDenominator: "setups that triggered",
    requiresFunnel: true,
  },
  confirmation: {
    kpiChips: ["netR", "expectancy", "winRate", "profitFactor", "maxDD"],
    tableColumns: ["eligible", "confirmationRate", "fills", "wins", "losses", "winRate", "netR", "expectancy", "maxDD"],
    fillLabel: "Confirmed Fill %",
    fillDenominator: "setups with confirmation signal",
  },
};
```

---

## 6. Metrics by Family

### Universal Metrics (all families)

These are valid for every family and safe for cross-family comparison when the eligible universe is clearly labeled:

- **Net R** — total R earned in the selected window
- **Expectancy** — net R per filled trade (R/trade)
- **Max Drawdown** — largest peak-to-trough equity drawdown in R
- **Win Rate** — wins / (wins + losses) among filled trades
- **Profit Factor** — gross wins / gross losses among filled trades
- **Trade Count** — number of filled trades (not eligible setups)
- **Sample Confidence** — INSUFFICIENT / LOW N / MODERATE N / ROBUST (10/30/50 thresholds)
- **Long Net R** — net R from long fills only
- **Short Net R** — net R from short fills only
- **Long Expectancy / Short Expectancy**
- **Long WR / Short WR**

### Baseline-Specific

- Fill Rate is always 100% by definition — do not display Fill% for baseline as a metric (it's meaningless, it's 1.0 by design)
- Show eligible N as the only "funnel" metric: how many setups occurred

### Penetration Family Metrics

- **Penetration Threshold** — the depth at which entry is placed (10 / 25 / 50 / 75%)
- **Fill Rate @ Level** — what % of setups reached the penetration level (not universal fill rate)
- **Delta vs Baseline Net R** — primary comparison metric
- **Delta vs Baseline Expectancy**
- **Improved vs Worse vs Baseline** — 3-way classification of each variant
- **Missed Winners** — baseline winners that didn't reach the penetration level
- **Avoided Losers** — baseline losers that didn't reach the penetration level
- **Trade-off Ratio** — (avoided losers %) / (missed winners %) — is the filtering worth it?

### Triggered Edge Family Metrics

These metrics only make sense for lifecycle-trigger models:

- **Trigger Rate** — % of eligible setups where the trigger threshold was hit (triggered / eligible)
- **Tapped Rate** — % where price touched OB edge before trigger (tapped / eligible)
- **Fill After Trigger Rate** — % of triggered setups that then filled at edge (filled / triggered)
- **Overall Fill Rate** — filled / eligible (the full funnel efficiency — label clearly as "end-to-end")
- **Never Triggered Count / %** — setups where trigger never fired
- **Cancelled After Trigger Count** — setups where trigger fired but fill was cancelled
- **Retrace Cancel Count** — subset of cancelled-after-trigger: specifically retrace/used-OB cancels
- **Same Candle Fill Count / %** — fills that happened on the same candle as the trigger
- **Next Candle Fill Count / %** — fills that happened on subsequent candles
- **Avg Trigger-to-Entry Time** — minutes from trigger to fill
- **Delta vs Baseline** — but labeled carefully: "Net R on triggered setups vs baseline on same setups" (requires baseline to be computed on the same eligible universe, not the full window — this is a **design requirement for V2**)

**Note on delta vs baseline for Triggered Edge:** The current implementation compares triggered-edge net R against full-window baseline net R. This is misleading because triggered edge only enters on a subset of setups. In V2, delta vs baseline for triggered edge should be computed as: "what would the baseline have earned on the same setups that triggered?" — i.e., the baseline R on that same subset of trades.

### Confirmation Family Metrics (future)

- **Confirmation Rate** — % of setups that produced a confirmation signal
- **Fill Rate on Confirmation** — % of confirmed setups that filled
- **Signal Lead Time** — how far in advance of fill the confirmation appeared
- **False Confirmation Rate** — confirmations that resulted in losses
- (Standard universal metrics apply after fill)

---

## 7. Long/Short Analysis Design

### Core Analysis Goal

The question is: does any entry model have a strong directional bias where its performance on longs is substantially different from its performance on shorts? And if so, should direction-specific model assignment be considered?

### Current State

`buildDirectionSplit()` and `DirectionPanel` already compute the per-model long/short stats. The data layer is correct. What's missing is the synthesis layer above it.

### V2 Direction Analysis Design

**Per-model direction row shape (already computed):**
```
model: { longNetR, longWR, longExp, longN, shortNetR, shortWR, shortExp, shortN, wrDelta }
```

**Per-family best-of (new — needs to be computed in analytics layer):**
```js
function bestModelByDirection(exactRows, tradesByMode, activeVariant) {
  // For each row, compute direction split if trades available
  // Return:
  //   bestLongModel: { row, longNetR, longN }
  //   bestShortModel: { row, shortNetR, shortN }
  //   bestBalancedModel: { row, score }  // balanced = neither direction extremely dominant
}
```

**Direction recommendation logic:**

```
If abs(wrDelta) > 20% AND min(longN, shortN) >= 15:
  → Flag as "Directionally Asymmetric" with a warning card
  → Show: "This model performs X% better on longs. Consider direction-specific assignment."

If longN < 15 or shortN < 15:
  → Flag: "⚠ Low sample in one direction — direction bias is not statistically meaningful."

If bestLongModel !== bestShortModel:
  → Show: "Best long model and best short model differ. Mixed-model analysis available."
```

**Mixed Model Simulation Display (design for future execution):**

A UI card that lets the user select:
- Long entry model: [selector]
- Short entry model: [selector]

Computed output (read-only simulation):
- Combined trades: (long trades from model A) + (short trades from model B)
- Combined net R
- Combined win rate
- Combined expectancy
- Breakdown: Long component | Short component | Total

This data can be computed purely from existing `tradesByMode` data. No new backend data is required. The combined simulation is just merging two per-model trade lists by direction.

**Storage / Config Design (for future backend assignment):**

```js
// Structure to design toward (not implement yet):
{
  entryModelAssignment: {
    mode: "directional",         // "uniform" | "directional"
    longModel: "entry_triggered_edge_25p0_next",
    shortModel: "entry_penetration_25p0",
  }
}
```

The frontend can render this config in a "Directional Assignment" card on the Direction tab so the user can see what a mixed-model run would look like before requesting the backend to implement it.

---

## 8. Implementation Phases

### Phase 1 — Registry Abstraction + Direction Matrix + Family Selector
*Fixes the misleading highlights and unlocks per-family best-of analysis.*

1. Add `familyType`, `metricsProfile`, `eligibleDescription`, `fillDescription`, `supportedDimensions`, `requiresLifecycleFunnel`, and `sensitivityAxis` to `PLANNED_ENTRY_MODES` entries in `entryRegistry.js`.
2. Add `METRICS_PROFILES` constant to `entryRegistry.js`.
3. Add `familyModelsWithData(exactRows)` helper that returns family → rows mapping.
4. Update `markHighlights()` to operate **per family** — `isBestNetR` only compared within the same family. Add global winners separately as `isGlobalBestNetR`.
5. Update `buildExactSummary()` to return both global and per-family winners.
6. Update `ModelKPIStrip` to use `metricsProfile` from registry instead of `startsWith("entry_triggered_edge")` string check.
7. Update `ExactResultsPanel` column visibility to be profile-aware: triggered-edge columns auto-show when a triggered-edge family section is expanded.
8. Add `bestModelByDirection()` function to `entryAnalytics.js`.
9. Update `DirectionPanel` to show Best Long / Best Short recommendation cards above the matrix.
10. Add direction-asymmetry warning logic (wrDelta > 20%).
11. Add family selector component (reusable segmented button group).

### Phase 2 — Triggered Edge Funnel Panel + Cancel Breakdown + Same vs Next
*Makes the existing funnel data visible for the first time.*

1. Create `TriggeredEdgeFunnelPanel.jsx` — waterfall visual using `triggeredEdgeFunnel` data already on rows.
2. Create `FunnelWaterfallBar` sub-component — a horizontal bar showing eligible → tapped → triggered → filled with percentage labels.
3. Create `CancelReasonPanel.jsx` — breakdown of retrace cancel, cancelled-after-trigger, never-triggered.
4. Create `SameNextCandlePanel.jsx` — side-by-side same vs next metrics.
5. Wire all three panels into `ModelAnalysis` for triggered-edge rows (show when `row.requiresLifecycleFunnel`).
6. Update `SensitivityPanel` to accept a `family` prop and render the appropriate sensitivity curve (penetration threshold or trigger threshold depending on family).
7. Add `Tab D: Lifecycle / Funnel` to the workspace tab bar.

### Phase 3 — Cross-Family Normalized Comparison + Recommendation Cards + Overview Tab
*The synthesis layer — where the real analytical value lives.*

1. Create `FamilySummaryCard.jsx` — family-level KPI card with best model, delta, direction split, sample confidence.
2. Create `OverviewTab.jsx` — mounts FamilySummaryCards + Recommendation Matrix + Cross-Family headline strip.
3. Add `buildCrossFamilyComparison()` to analytics — produces per-family best model, normalized using only valid cross-family metrics (Net R, Expectancy), explicitly excludes fill rate.
4. Update `DominanceMatrix` to either (a) show within-family only, or (b) show cross-family with invalid metrics (fillPct, fillAfterTrigger) replaced by Net R / Expectancy only and a banner explaining why.
5. Create `MixedModelSimulationCard.jsx` — long model selector + short model selector + combined simulation output.
6. Fix `deltaVsBaseline` for Triggered Edge — compute baseline R on the same triggered-setups subset, not full window.

### Phase 4 — Backend Config Preparation for Directional Assignment
*Infrastructure only, no execution.*

1. Add `entryModelAssignment` config schema to store/run shape documentation (comment/type definition only).
2. Add `DirectionalAssignmentPreview` card to Direction tab — shows what a mixed-model run config would look like.
3. Add "Export Assignment Config" button that generates the JSON config structure — useful when requesting backend support for mixed-model runs.
4. Add config validation: warn if selected long model has < 20 long trades, warn if selected short model has < 20 short trades.

---

## 9. Risks & Edge Cases

### Denominator Risk (Critical)
**Problem:** Cross-family comparison almost always involves comparing metrics computed on different eligible universes. Even Net R is affected — a Triggered Edge model that only fires on 50% of setups will naturally have different Net R than a Penetration model that fires on 85% of setups, even if the per-trade quality is identical.

**Mitigation:** Always show eligible N alongside any Net R comparison. Add a "normalize to same eligible universe" option for cross-family comparison (requires computing baseline on the same filtered setups, not full window). Never hide the denominator from the user.

### Sample Size Traps
**Problem:** Direction splits halve the sample size. A model with 40 trades and 20/20 long/short is at the threshold of meaningfulness on each direction. A model with 25 total trades should not be generating directional recommendations at all.

**Mitigation:** Per-direction N thresholds (suggest: N < 15 = "insufficient for direction analysis"). Show direction confidence as a separate badge from overall sample confidence. Disable "best long/short model" cards when any directional N is insufficient.

### Cancelled Rows Polluting Performance (Already Partially Fixed)
**Problem:** `cancelled_before_entry` rows are excluded from performance metrics in `entryStatsFromTrades()` and `buildTriggeredEdgeFunnel()`. However, cancelled rows must still count toward funnel stages (they are real outcomes). If cancelled rows are accidentally included in win/loss/R calculations the performance stats are corrupted.

**Mitigation:** Maintain strict separation: funnel counts include all rows, performance metrics exclude cancelled-before-entry rows. Add a `_debug_cancelled_included` validation assertion to catch regressions.

### Overfitting to Date Range
**Problem:** A model that looks best in the current run's date range may simply be capturing a regime. The current architecture has no regime tagging.

**Mitigation (existing):** Robustness Lab tab handles this. Ensure it remains family-aware so you can run robustness per family. Add rolling N-trade window analysis per family in Phase 2.

### Direction Overfitting
**Problem:** With a small dataset, the "best long model" and "best short model" derived from the same data could simply reflect noise. Running separate models for longs and shorts adds a second layer of overfitting risk on top of the base model selection problem.

**Mitigation:** Show the directional assignment simulation output as exploratory only. Require minimum N per direction (suggest 30+) before showing directional recommendation as "actionable." Show in-sample vs out-of-sample direction performance if walk-forward data is available.

### Mixed Model Execution Complexity
**Problem:** When designing for "Model A longs + Model B shorts," the combined equity curve is not simply the sum of the two model equity curves — the trade sequencing and correlation effects matter. Drawdown on the combined model is not max(DD_A, DD_B).

**Mitigation:** The simulation card in Phase 3 should compute the combined sequence correctly: merge long trades from Model A and short trades from Model B by timestamp, then compute equity curve and DD on the merged sequence. Do not sum metrics naively.

### "Tapped" Field Reliability
**Problem:** The `tapped_before_trigger` and `tapped_time` fields in the funnel are used to compute "tapped but not yet triggered" counts. If the Python exporter doesn't populate these fields consistently, the funnel stages will show misleading drop-offs.

**Mitigation:** Add data quality indicators to the funnel panel: show which funnel fields are present vs missing in the data, and display a "⚠ Partial funnel data" warning when `tappedCount === 0` but `triggeredCount > 0` (which indicates missing tapped data, not a real zero).

### Future Family Conflicts
**Problem:** The `Lifecycle` and `Reclaim` families in `ENTRY_FAMILIES` have no models yet but are listed in the registry. Adding models to these families will require decisions about which `metricsProfile` and `familyType` they map to.

**Mitigation:** The Phase 1 registry enhancement should include clear comments on how to classify a new family when adding it. The `familyType` enum should be documented with examples so future additions don't default to "standard" when they should use "lifecycle_trigger" or "confirmation_entry."

---

## 10. Recommended Next Implementation Prompt

The highest-value, lowest-risk starting point is **Phase 1 — Registry Abstraction**. It fixes the most misleading behavior (cross-family highlights) while being entirely additive (no existing behavior is removed, only new fields added and highlight logic scoped per-family).

The following prompt is ready to hand to an implementation session:

---

```
PROJECT: FX-OB-Research-Lab
TASK: Entries Lab V2 — Phase 1 Implementation
MODE: IMPLEMENT. EDIT FILES. DO NOT REDESIGN.

CONTEXT:
The current Entries Lab has a misleading cross-family highlights problem.
markHighlights() in entryAnalytics.js awards BEST FILL, BEST R, etc. 
across all model families. This is wrong because:
- Baseline fill% is hardcoded to 100%
- Penetration fill% = setups reaching penetration level
- Triggered Edge fill% = setups that triggered AND filled at edge
These are not comparable metrics.

Additionally, the registry has no machine-readable type semantics.
Family is a string label only. Components detect family type via
scattered startsWith("entry_triggered_edge") checks.

CHANGES REQUIRED:

1. entryRegistry.js — add fields to PLANNED_ENTRY_MODES entries:
   - familyType: "edge_touch" | "level_entry" | "lifecycle_trigger" | "confirmation_entry"
   - metricsProfile: "standard" | "penetration" | "triggered_edge" | "confirmation"
   - eligibleDescription: string
   - fillDescription: string
   - supportedDimensions: string[]
   - requiresLifecycleFunnel: boolean
   - sensitivityAxis: string | null
   Add METRICS_PROFILES constant.
   Add familyModelsWithData(exactRows) helper.

2. entryAnalytics.js — update markHighlights(rows):
   - Change from: bestBy(all_exact_rows, "netR")
   - Change to: compute per-family bests separately
   - Add new flags: isBestNetRInFamily, isBestExpectancyInFamily, etc.
   - Keep existing global flags (isBestNetR) but also compute per-family
   - Update buildExactSummary() to return perFamily: { Baseline: {...}, Penetration: {...}, "Triggered Edge": {...} }

3. entryAnalytics.js — add bestModelByDirection(exactRows, tradesByMode, activeVariant):
   - For each exact row, compute direction split using buildDirectionSplit
   - Return { bestLongModel, bestShortModel, bestBalancedModel }
   - Include directional sample confidence warnings

4. ModelKPIStrip.jsx — replace startsWith("entry_triggered_edge") check:
   - Import metricsProfile lookup from registry
   - Use metricsProfile === "triggered_edge" for conditional chips
   - Disambiguate "Fill Rate" label: show row.fillDescription from registry

5. ExactResultsPanel.jsx — update RowTags:
   - Show isBestNetRInFamily badges when viewing within a family section
   - Show isBestNetR (global) badge only in a cross-family summary view
   - The BEST FILL tag should NOT appear for triggered edge rows
     (fill% denominator is incompatible with penetration fill%)

6. DirectionPanel.jsx — add synthesis layer:
   - Add two recommendation cards above the existing table:
     BEST LONG MODEL | BEST SHORT MODEL
   - Show wrDelta > 20% warning inline per row
   - Show per-direction sample confidence badge per row

FILES TO EDIT:
- frontend/src/components/lab/entries/analytics/entryRegistry.js
- frontend/src/components/lab/entries/analytics/entryAnalytics.js
- frontend/src/components/lab/entries/model/ModelKPIStrip.jsx
- frontend/src/components/lab/entries/model/ExactResultsPanel.jsx
- frontend/src/components/lab/entries/model/DirectionPanel.jsx

DO NOT TOUCH:
- EntriesWorkspace.jsx (no structural changes needed)
- ModelAnalysis.jsx (panel layout unchanged in Phase 1)
- Any tab other than model-analysis

STOP AFTER Phase 1. Do not implement funnel panel or new tabs yet.
```

---

*End of audit document. No files were modified.*
