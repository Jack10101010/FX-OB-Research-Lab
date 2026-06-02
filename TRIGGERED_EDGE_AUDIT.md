# Triggered-Edge Audit + Design Report
_FX-OB-Research-Lab · Audit/Design Only · May 2026_

---

## 1. Files Read

| File | Purpose |
|---|---|
| `frontend/src/pages/StrategyMap.jsx` | Full page — data wiring, layer toggles, chart props, trade list, intelligence panel |
| `frontend/src/components/lab/CandleChart.jsx` | Chart engine (LWC v4) — overlay layer, OB boxes, RR tools, news events, session highlights, OB markers |
| `frontend/src/data/importer.js` | Bundle ingestion — CSV parsers for candles, OBs, trades; field extraction; trade enrichment |
| `frontend/src/components/lab/entries/analytics/entryRegistry.js` | Entry model registry — PLANNED_ENTRY_MODES, ENTRY_FAMILIES, family helpers |
| `frontend/src/components/lab/entries/analytics/entryAnalytics.js` | Pure analytics — entry row builders, session/hour grids, trade-off stats, direction split |
| `frontend/src/components/lab/entries/model/ExactResultsPanel.jsx` | Results table — family-grouped rows, col visibility, sort, highlight tags |
| `frontend/src/components/lab/entries/model/ModelKPIStrip.jsx` | KPI strip — Net R, Expectancy, Win Rate, PF, Max DD, Fill Rate, Δ vs Baseline |
| `frontend/src/data/store.js` | Reactive store — run index, bundle memory, candle management, headlineSummary |
| `EntryModelDeepDive.jsx` | **Does not exist** — confirmed via glob |

---

## 2. StrategyMap Current Data Path

### 2.1 Candle source

```
useDataset() → { CANDLES, candleLoadStatus }
bundle = getRunData(runId)              ← full in-memory run bundle
sourceCandles = CANDLES?.length ? CANDLES : bundle.candles
```

Candles are either live streaming data from the active run (CANDLES from store) or loaded from IndexedDB / sidecar on demand. They are normalised into `{ i, t, time, o, h, l, c }` in `normalizeDisplayCandles()` and then optionally resampled to 5 m or 15 m by `resampleCandlesForDisplay()`.

### 2.2 Order blocks

```
rawChartObBoxes = (isViewedActiveRun && OB_BOXES_ENRICHED) || bundle.orderBlocks
chartObBoxes   = enrichObsWithTradeLabels(rawChartObBoxes, activeTrades)
```

OB boxes carry `{ id, time0, time1, top, bot, side, obFinalStatus, linkedTradeId, … }`. `enrichObsWithTradeLabels` merges the linked trade's outcome, R-result, and news-flatten flag onto each OB.

### 2.3 Trades

```
selectedVariant = ACTIVE_TRADE_VARIANT || bundle.primaryVariant
activeTrades    = bundle.tradesByVariant[selectedVariant] || bundle.trades
```

Filtered through `filterStrategyTrades()` for the trade list panel; passed unfiltered to `CandleChart` as `trades` (marker array).

### 2.4 Trade markers (entry arrows)

```
chartTradeMarkers = TRADE_MARKERS (live) || bundle.tradeMarkersByVariant[variant] || bundle.tradeMarkers
```

These are pre-computed `{ i, time, price, direction, win, id }` objects. They are passed to `CandleChart` but the chart **intentionally clears all markers** (`series.setMarkers([])`) — entry arrows are suppressed; only the RR tool boxes indicate entries.

### 2.5 RR tools

```
rrTools = buildRrToolsFromObs(chartObBoxes, activeTrades)   [if showRrTools]
```

Builds `{ fillTime, entry, stop, tp, exitTime, direction, outcome }` from each OB + its linked trade. `CandleChart` renders these as green/red filled rectangles (`rrToolShapes`).

### 2.6 News / sessions

- News events come from `buildStrategyMapNewsEvents(bundle)` — rendered as vertical lines + blackout boundary dashes.
- Sessions come from `buildSessionRanges(displayCandles, sessionSettings)` — rendered as translucent column bands.

### 2.7 Current layer toggle state

| Toggle name | State key | Affects in CandleChart |
|---|---|---|
| Order Blocks | `showOB` | OB overlay rectangles |
| BOS / CHoCH | `showBC` | — (no current marker) |
| Sessions | `showSessions` | Session band overlays |
| OB Origin | `showObOriginMarkers` | Vertical origin markers |
| OB Detection | `showObDetectionMarkers` | Vertical detection markers |
| OB IDs | `showObLabels` | OB label text inside box |
| RR Tools | `showRrTools` | Risk/reward fill boxes |
| News | `showNewsEvents` | News event lines |
| News Labels | `showNewsLabels` | News label chips |
| Longs / Shorts / Wins / Losses | `showLongs` etc. | Passed to chart but trade marker set is cleared |
| Markers | `showMarkers` | Gates origin + detection markers |

### 2.8 Selected trade highlight

`selectedTradeId` passed to `CandleChart` — referenced but not visually differentiated in the current overlay rendering (no per-trade selection highlight in the OB layer).

---

## 3. Triggered-Edge Visual Limitations with Current Overlays

### What works today

- OB box is drawn correctly (time0→time1, top→bot).
- RR tools show fill-time + entry/stop/TP geometry.
- OB labels show OB ID + trade ID + R result.
- OB colour encodes final outcome (win/loss/invalid/cancelled).
- OB origin and detection markers are present.

### What is completely absent

1. **Trigger threshold line.** There is no visual for the X% penetration level inside the OB at which arming occurs. A viewer cannot see where the trigger level was.

2. **Trigger touch marker.** No way to see when/where price first penetrated to the trigger level (the `trigger_time` / `trigger_candle_index` event).

3. **Armed state indicator.** After trigger is fired, the edge limit order is placed. There is no marker for `armed_at` — the moment the pending order became live.

4. **Edge revisit / fill marker.** For next-candle mode, the edge is re-approached on a later candle. There is no marker for `edge_revisit_time`.

5. **Same-candle vs next-candle label.** Currently entry mode key and candle mode are stored in trade fields but never surfaced on the chart.

6. **Cancel / retrace-cancel marker.** `cancelled_before_entry`, `cancel_reason`, `retrace_cancel_time`, and `retrace_cancel_distance_pips` have no visual representation.

7. **Tapped-but-not-triggered.** When the OB was tapped but price did not reach the trigger level, the OB should show a "tap" marker. `tapped_time` and `tapped_candle_index` are captured but unused visually.

8. **Never-triggered.** OBs with `tapped_before_trigger = false` (never reached) need a distinct visual state different from "unfilled" or "pending."

9. **Label badges.** None of the logical states (Same, Next, Used OB Cancel, Never Triggered, Invalidated Before Entry) are shown on the chart.

10. **Lifecycle arrow / flow.** The triggered-edge lifecycle has a sequence: OB box → trigger penetration → arm → edge fill. That sequence is invisible; the chart shows only the final OB box and an RR rectangle.

---

## 4. Missing Data Fields

### 4.1 Importer assessment

**All triggered-edge output fields are already parsed and preserved by `parseTradesCSV()`.** The importer (lines 378–413) explicitly handles every field in the spec:

| Field | Importer status |
|---|---|
| `entry_model_key` | ✅ parsed (line 371) |
| `trigger_penetration_pct` | ✅ parsed (line 378) |
| `trigger_time` | ✅ parsed (line 381) |
| `trigger_candle_index` | ✅ parsed (line 382) |
| `armed_at` | ✅ parsed (line 384) |
| `armed_on_trigger_candle` | ✅ parsed (line 386) |
| `filled_on_trigger_candle` | ✅ parsed (line 390) |
| `same_candle_entry_allowed` | ✅ parsed (line 392) |
| `entry_level_pct` | ✅ parsed (line 394) |
| `edge_revisit_time` | ✅ parsed (line 396) |
| `trigger_to_entry_minutes` | ✅ parsed (line 398) |
| `cancelled_before_entry` | ✅ parsed (line 400) |
| `cancel_reason` | ✅ parsed (line 402) |
| `tapped_before_trigger` | ✅ parsed (line 404) |
| `tapped_time` | ✅ parsed (line 406) |
| `tapped_candle_index` | ✅ parsed (line 408) |
| `retrace_cancel_time` | ✅ parsed (line 410) |
| `retrace_cancel_distance_pips` | ✅ parsed (line 412) |

**Both camelCase and snake_case aliases are preserved** on each trade object, so downstream code can use either form.

### 4.2 Fields preserved through the bundle pipeline

`enrichTradesWithOrderBlocks()` does not strip these fields — it spreads `...trade` and only adds/overwrites OB-joined fields. All triggered-edge fields survive into `bundle.tradesByVariant` intact.

### 4.3 OB-level fields to verify

The `parseOrderBlocksCSV()` parser does not have explicit fields for triggered-edge OB state (e.g., an OB-level `trigger_threshold_pct` or `tapped_time`). These lifecycle events are currently only on the _trade_ side. This is acceptable for Phase A, but for Phase C (chart markers), the chart overlay builder will need to join trade-level fields back to the OB when constructing lifecycle markers. That join already exists in `enrichObsWithTradeLabels()` — it just needs to be extended.

### 4.4 No missing fields: confirmed

No new fields need to be added to the importer. The data is already there.

---

## 5. Analytics Impact Map

### 5.1 Metrics that already work correctly for triggered-edge

These metrics operate purely on the final trade R value and are model-agnostic:

- Net R
- Expectancy (net R / fills)
- Win Rate (r > 0 / total fills)
- Max Drawdown
- Profit Factor
- Session breakdown (sessionRows, sessionRowsForModel)
- Direction split (long vs short)
- Hour/day heatmap (buildHourGrid)
- Toxicity grid (buildToxicityGrid — loss-only hour grid)

### 5.2 Metrics that are misleading for triggered-edge

**Fill Rate / fillPct**

`entryStatsFromTrades()` counts a trade as "filled" if `entry_model_filled === true` or `missed_trade !== true && !!t.entry`. For triggered-edge, this conflates several distinct outcomes: the OB was touched but trigger never reached, the trigger fired but fill was cancelled, and the trigger fired and filled. All three scenarios may be in the trade rows depending on backend exporter design. If cancelled-before-entry rows are included, `fillPct` will be artificially low or high depending on inclusion logic.

**Eligible setups count**

Currently `eligible` = total rows in the mode's CSV. For triggered-edge, a row can represent a setup that: (a) was never touched, (b) was tapped but not triggered, (c) was triggered + cancelled, or (d) was triggered + filled. Treating all as "eligible" and all filled trades as "fills" hides the funnel. A reviewer seeing "60 eligible, 30 fills → 50% fill rate" cannot tell if that 50% is because 50% never triggered, or because 50% cancelled after triggering.

**Δ vs Baseline**

The delta is net R difference. This is still meaningful but the interpretation changes: triggered-edge is not a threshold on where you enter inside the OB, it is a gating condition. Comparing raw net R against baseline is valid only if the eligible universe is matched. If the triggered-edge exporter omits never-triggered OBs, the baseline denominator is different and the delta is not apples-to-apples.

**avgTimeToTP / avgTimeToSL** (currently null in the analytics output)

These are not computed at all today — the fields are read from summary JSON if present. For triggered-edge, `trigger_to_entry_minutes` is available and is a more informative timing field than time-from-OB-creation. The existing `avgTimeToTP` slot could be repurposed, but it would be cleaner to add a new KPI.

### 5.3 Metrics that produce completely wrong results

**None of the existing metrics are actively wrong** — they do not divide by zero or invert direction. The problem is _incompleteness and misinterpretation_, not calculation errors.

---

## 6. New Metrics Proposal

### 6.1 Triggered-edge funnel metrics

These should be computed from the trade rows for any `entry_model_key` that matches `triggered_edge_*`.

```
trigger_rate            = rows where trigger_time != "" / total eligible rows
fill_after_trigger_rate = filled rows / triggered rows
never_triggered_count   = rows where tapped_before_trigger == false
tapped_not_triggered    = rows where tapped_before_trigger == true AND trigger_time == ""
retrace_cancel_count    = rows where retrace_cancel_time != ""
invalidated_before_entry= rows where cancelled_before_entry == true AND cancel_reason != "retrace_cancel"
```

### 6.2 Timing metrics

```
avg_trigger_to_entry_minutes = mean(trigger_to_entry_minutes) where filled
p50_trigger_to_entry_minutes = median(trigger_to_entry_minutes)
```

### 6.3 Candle mode metrics

```
same_candle_fill_count = rows where filled_on_trigger_candle == true
next_candle_fill_count = rows where filled_on_trigger_candle == false AND entry_model_filled == true
same_candle_fill_pct   = same_candle_fill_count / total filled
```

### 6.4 Conditional performance metrics (split by lifecycle outcome)

```
triggered_win_rate          = wins / filled (already available, but should be labelled "of triggered fills")
triggered_expectancy        = net R / filled (same)
never_triggered_expectancy  = 0 by definition (but shows opportunity cost)
```

### 6.5 Avoided R estimate (future)

```
cancelled_avoided_r = impossible to compute without simulation of what the cancelled setup would have produced
```

This metric is not computable from current exporter data. Flag it as "future — requires virtual fill simulation."

### 6.6 New analytics function signature (design only)

```js
// To be added to entryAnalytics.js
export function buildTriggeredEdgeFunnel(trades) {
    const list = Array.isArray(trades) ? trades : [];
    const eligible         = list.length;
    const tapped           = list.filter(t => t.tapped_before_trigger === true);
    const triggered        = list.filter(t => t.trigger_time && t.trigger_time !== "");
    const filled           = list.filter(t => t.entry_model_filled === true || (t.trigger_time && !!t.entry));
    const cancelledAfterTrigger = list.filter(t => t.cancelled_before_entry === true && t.trigger_time && t.trigger_time !== "");
    const retraceCancel    = list.filter(t => t.retrace_cancel_time && t.retrace_cancel_time !== "");
    const sameCandle       = filled.filter(t => t.filled_on_trigger_candle === true);
    const nextCandle       = filled.filter(t => t.filled_on_trigger_candle === false);
    const neverTriggered   = list.filter(t => !t.trigger_time || t.trigger_time === "");

    const triggerToEntryMinutes = filled
        .map(t => t.trigger_to_entry_minutes)
        .filter(v => v != null && Number.isFinite(Number(v)))
        .map(Number);
    const avgTriggerToEntry = triggerToEntryMinutes.length
        ? triggerToEntryMinutes.reduce((s, v) => s + v, 0) / triggerToEntryMinutes.length
        : null;

    return {
        eligible,
        tappedCount:         tapped.length,
        triggeredCount:      triggered.length,
        triggerRate:         eligible ? (triggered.length / eligible) * 100 : 0,
        fillAfterTriggerRate: triggered.length ? (filled.length / triggered.length) * 100 : 0,
        filledCount:         filled.length,
        cancelledAfterTrigger: cancelledAfterTrigger.length,
        retraceCancelCount:  retraceCancel.length,
        neverTriggeredCount: neverTriggered.length,
        sameCandle:          sameCandle.length,
        nextCandle:          nextCandle.length,
        avgTriggerToEntry,
    };
}
```

---

## 7. Registry and Grouping

### 7.1 Current state

`entryRegistry.js` already has two triggered-edge entries:

```js
{ mode: "entry_triggered_edge_25p0_same", label: "Trigger 25% → Edge entry · same candle", family: "Triggered Edge", threshold: "25% same", status: "tested" },
{ mode: "entry_triggered_edge_25p0_next", label: "Trigger 25% → Edge entry · next candle", family: "Triggered Edge", threshold: "25% next", status: "tested" },
```

And `ENTRY_FAMILIES` already includes `{ key: "Triggered Edge", label: "Triggered Edge", color: "hsl(var(--success))" }`.

### 7.2 What is missing from the registry

The registry covers only 25% same and 25% next. Additional threshold variants (e.g., 10%, 50%, 75%) and mode combinations will need entries added. The pattern to follow is clear.

### 7.3 Grouping for comparison

For the Entries Lab, triggered-edge modes should be compared:

- **Within family:** same vs next candle at the same threshold (e.g., 25% same vs 25% next). The key question is whether same-candle fills outperform next-candle or vice versa.
- **Across thresholds:** 10% vs 25% vs 50% triggered-edge (do deeper trigger levels produce better fills?).
- **Against baseline:** Compare triggered-edge net R / expectancy against the baseline edge touch. The delta should control for eligible count differences.
- **Against penetration entries:** Triggered-edge at 25% vs penetration-25% entry — these are architecturally different (trigger then edge vs direct 25% entry) and comparison is insightful.

### 7.4 Recommended ExactResultsPanel grouping

The `FamilySection` component already handles family grouping. No structural change to the table needed. The "Triggered Edge" family section will render once triggered-edge mode rows are present in `exactRows`. The rows will already show: threshold (e.g., "25% same"), fill rate, win rate, expectancy, Δ vs baseline.

New columns to add to `ExactResultsPanel` for triggered-edge:

| Column key | Label | Source |
|---|---|---|
| `triggerRate` | Trigger Rate | funnel analytics |
| `fillAfterTrigger` | Fill/Trigger | funnel analytics |
| `avgTriggerToEntry` | Avg T→Fill | funnel analytics |
| `sameCandle` | Same/Next | funnel analytics |

These should be gated by `colVis.triggeredEdge` so they don't clutter other family views.

---

## 8. Visual Design Proposal

### 8.1 OB box (unchanged)

The existing OB box is drawn with `time0→time1, top→bot`. For triggered-edge, `time1` should extend to either `edge_revisit_time` (if the edge was revisited for fill) or to `trigger_time` at minimum. This ensures the box shows the active period. If `chart_right_time` is already set by the backend for triggered-edge OBs, this is handled automatically by the existing `chartRightTime` field in `parseOrderBlocksCSV`.

### 8.2 Trigger threshold line

A horizontal dashed line at `entry_level_pct` distance from the OB edge (the exact price level = `obTop + (obBot - obTop) * entry_level_pct / 100` for a bullish OB). This line should span the full width of the OB box horizontally.

Implementation: add a `triggeredEdgeLevels` computed array in `CandleChart` (parallel to `rrToolShapes`). Each element has: `{ priceLevel, time0, time1, color, label }`. Render as an absolutely-positioned thin dashed horizontal div inside the OB box bounds.

Color: use `rgba(245, 158, 11, 0.65)` (amber) — distinct from OB border, associated with "trigger/armed" state.

### 8.3 Lifecycle point markers

All lifecycle markers share the same approach as `OrderBlockMarker` — a vertical 1px line with a small dot and label chip. New marker kinds:

| Marker kind | Source field | Symbol | Color |
|---|---|---|---|
| `tapped` | `tapped_time` | ◇ | `rgba(99, 102, 241, 0.75)` (indigo) |
| `triggered` | `trigger_time` | ▲ | `rgba(245, 158, 11, 0.9)` (amber) |
| `armed` | `armed_at` | ★ | `rgba(234, 179, 8, 0.9)` (yellow) |
| `edge_revisit` | `edge_revisit_time` | ◉ | `rgba(6, 182, 212, 0.9)` (cyan) |
| `retrace_cancel` | `retrace_cancel_time` | ✕ | `rgba(239, 68, 68, 0.9)` (red) |

Each marker is positioned via `chart.timeScale().timeToCoordinate(time)` and `series.priceToCoordinate(price)`. The y-position for tapped/triggered/armed/retrace-cancel should use the OB edge price (either top or bot depending on direction). Edge revisit uses the OB edge price (that is the fill level).

### 8.4 Label badges on OB box

Extend `orderBlockLabelText()` or add an overlay badge to `OrderBlockOverlay` for triggered-edge states. Badges:

| Condition | Badge text | Badge color |
|---|---|---|
| `same_candle_entry_allowed && filled_on_trigger_candle` | SAME | cyan |
| `same_candle_entry_allowed == false \|\| filled_on_trigger_candle == false` | NEXT | indigo |
| `cancelled_before_entry && cancel_reason == "retrace"` | USED OB | red |
| `!trigger_time && tapped_before_trigger == false` | NEVER TRIG | muted gray |
| `cancelled_before_entry && cancel_reason != "retrace"` | INVAL | orange |

Badges should be rendered as small `<span>` chips in the top-right corner of the OB box div (parallel to the existing `obId` label in top-left).

### 8.5 Color palette for triggered-edge overlays

```js
const TRIGGERED_EDGE_COLORS = {
    triggerLevel:   "rgba(245, 158, 11, 0.55)",  // amber dashed line
    triggerTouch:   "rgba(245, 158, 11, 0.90)",  // amber marker
    tapped:         "rgba(99,  102, 241, 0.75)",  // indigo marker
    armed:          "rgba(234, 179, 8,   0.90)",  // yellow marker
    edgeRevisit:    "rgba(6,   182, 212, 0.90)",  // cyan marker
    retraceCancel:  "rgba(239,  68,  68, 0.90)",  // red marker
    badgeSame:      "rgba(6,   182, 212, 0.15)",  // cyan fill
    badgeNext:      "rgba(99,  102, 241, 0.15)",  // indigo fill
    badgeUsedOb:    "rgba(239,  68,  68, 0.15)",  // red fill
    badgeNeverTrig: "rgba(107, 114, 128, 0.12)",  // gray fill
    badgeInval:     "rgba(234, 119,   6, 0.15)",  // orange fill
};
```

---

## 9. Layer Toggle Proposals

New layer toggles to add to `DEFAULT_LAYERS` and the filter bar in `StrategyMap.jsx`:

```js
// Additions to DEFAULT_LAYERS:
triggeredEdgeLevels:    false,   // trigger threshold lines inside OB
triggeredEdgeLifecycle: false,   // tapped/triggered/armed/revisit markers
triggeredEdgeBadges:    true,    // Same/Next/Used OB/Never Trig label badges on OB
cancelledSetups:        true,    // show cancelled + never-triggered OBs (vs hide them)
entryModelFilter:       null,    // null = show all, or a mode key string
```

Toggle bar additions (to appear in the same filter row, after OB IDs):

- **"Trigger Levels"** — shows dashed horizontal trigger threshold lines inside OB boxes
- **"Lifecycle Markers"** — shows tapped / triggered / armed / revisit / cancel point markers
- **"OB Badges"** — shows Same / Next / Used OB / Never Trig chip on box
- **"Entry Model"** dropdown (NeonSelect) — "All models" or specific mode key, filters which OBs are shown

These four are off by default to avoid clutter on a first open. OB Badges can be default-on since they are compact.

---

## 10. Implementation Phases

### Phase A: Preserve fields + registry labels
_No user-facing change needed. Data is already flowing._

1. Confirm `entry_model_key` is mapped to the correct mode in `entryRegistry.js` for all triggered-edge variants (e.g., "entry_triggered_edge_25p0_same" matches the backend's exporter key). Add registry entries for any threshold variants beyond 25%.
2. Add validation warning in `validateCsvHeaders()` for triggered-edge fields: `trigger_time`, `trigger_penetration_pct`, `armed_at`. This surfaces missing fields at import time.
3. Extend `buildRunInfoRows()` to surface `entry_model_key` frequency counts in the Run Info dropdown.

**Files to edit:** `entryRegistry.js`, `importer.js` (validateCsvHeaders), `StrategyMap.jsx` (buildRunInfoRows)

### Phase B: Entries Lab analytics for triggered-edge
_Entries Lab gains a funnel section and new KPIs when a triggered-edge mode is selected._

1. Add `buildTriggeredEdgeFunnel(trades)` to `entryAnalytics.js` (design above, §6.6).
2. In `buildEntryAnalytics()`, detect if selected mode is triggered-edge (`mode.startsWith("entry_triggered_edge")`), and if so compute and attach the funnel object.
3. Add `triggerRate`, `fillAfterTrigger`, `sameCandle`, `nextCandle`, `avgTriggerToEntry` to the analytics row object returned by `entryStatsFromTrades()` for triggered-edge trades.
4. Add a `TriggeredEdgeFunnelPanel` component — a small horizontal funnel visual: Eligible → Tapped → Triggered → Armed → Filled. Show counts and rates at each step.
5. Add triggered-edge columns to `ExactResultsPanel` grid template behind a `colVis.triggeredEdge` flag. Show when any triggered-edge row is present in the visible family.
6. Add `Trigger Rate`, `T→Fill`, and `Same/Next` chips to `ModelKPIStrip` — show only when `row.mode.startsWith("entry_triggered_edge")`.
7. Update `buildMatrixRows()` in `entryAnalytics.js` to include a "Triggered Edge" row alongside Baseline, Penetration, Confirmation.

**Files to edit:** `entryAnalytics.js`, `entryRegistry.js`, `ExactResultsPanel.jsx`, `ModelKPIStrip.jsx`
**New files:** `TriggeredEdgeFunnelPanel.jsx`

### Phase C: StrategyMap lifecycle markers
_Chart gains triggered-edge lifecycle visualisation._

1. Add `DEFAULT_LAYERS` entries: `triggeredEdgeLevels`, `triggeredEdgeLifecycle`, `triggeredEdgeBadges`, `cancelledSetups`, `entryModelFilter`.
2. Add four new layer toggle buttons to the filter bar in `StrategyMap.jsx`.
3. Pass new props to `CandleChart`:
   - `triggeredEdgeOverlays: []` — list of `{ obId, triggerPrice, tappedTime, triggerTime, armedAt, edgeRevisitTime, retraceCancelTime, sameCandle, outcomeState }` — built in StrategyMap from `activeTrades` filtered to triggered-edge
   - `showTriggeredEdgeLevels: bool`
   - `showTriggeredEdgeLifecycle: bool`
   - `showTriggeredEdgeBadges: bool`
4. In `CandleChart.jsx`, add two new computed overlay arrays (parallel to `obMarkers`, `rrToolShapes`):
   - `triggeredEdgeLevelLines` — horizontal dashed price level lines at `entry_level_pct` inside each OB (rendered as thin divs positioned by `priceToCoordinate`)
   - `triggeredEdgeLifecycleMarkers` — vertical point markers for each lifecycle event (tapped/triggered/armed/revisit/cancel), positioned by `timeToCoordinate`
5. Extend `OrderBlockOverlay` to render badge chips from OB-level props (`badgeState: "same" | "next" | "used_ob" | "never_trig" | "inval" | null`) — the badge state is pre-computed during `enrichObsWithTradeLabels()`.
6. Add triggered-edge OB colour logic to `resolveObVisual()` — e.g., `armed_not_filled` → distinct pending colour, `retrace_cancelled` → distinct red variant.

**Files to edit:** `StrategyMap.jsx`, `CandleChart.jsx`

### Phase D: Deep dive + richer comparison
_Research-grade cross-family comparison and triggered-edge deep dive tab._

1. Build `EntryModelDeepDive.jsx` — it does not currently exist. It should show:
   - Funnel waterfall: Eligible → Triggered → Filled (with same/next split)
   - Trigger-to-entry time distribution (histogram or box plot)
   - Cancel reason breakdown (retrace cancel vs invalidation vs other)
   - Win rate conditioned on same-candle vs next-candle
   - Triggered-edge vs penetration 25% side-by-side KPI comparison
2. Add a "Triggered Edge" tab to `EntryModelDeepDive` (or route via the existing model selector).
3. Add `avgTriggerToEntry`, `triggerRate`, `fillAfterTrigger`, `retraceCancelCount` to the CSV export fields in `entryResultsToCsv()`.
4. Consider a "funnel drop-off" annotation in `ExactResultsPanel` for triggered-edge rows — show a small inline "25% trig → 80% fill" text below the threshold value.

**Files to edit / new files:** `entryAnalytics.js`, `ExactResultsPanel.jsx`, new `EntryModelDeepDive.jsx`

---

## 11. Risks and Edge Cases

### 11.1 Same-candle OHLC ambiguity

When `filled_on_trigger_candle == true`, the trigger and fill both occur within a single candle's OHLC range. On a 1m chart this is fine, but on a 15m chart the sequence (which price came first, trigger or fill) is unknown. The trigger marker and fill RR box will overlap. Mitigation: display a "(same candle)" note in the lifecycle tooltip rather than trying to show sub-candle order.

### 11.2 Cancelled rows vs valid trades

If the backend exports cancelled setups as rows in the trades CSV (with `cancelled_before_entry == true`), the existing `entryStatsFromTrades()` will include them in `eligible` but they will not count as `filled` (since they have no entry timestamp and `entry_model_filled` is falsy). This is correct behaviour. The risk is if cancelled rows have an `r = 0` — `rOf()` returns 0, which will silently count them as zero-R neutral trades in win/loss logic. Add a `trade.cancelled_before_entry` guard in `rOf()` or in fill detection to exclude them from performance metrics entirely.

### 11.3 No tick sequence

There is no tick or sub-candle data. The trigger price, armed price, and fill price all happen within a candle's range. When drawing lifecycle markers, snap all event times to the candle open time of the candle they occur in (using `snapFloor`). Do not attempt to imply sub-candle ordering.

### 11.4 Chart clutter

Triggered-edge adds up to 5 point markers per OB (tapped, triggered, armed, revisit, cancel) plus a trigger threshold line. On a chart with 40+ OBs this is visually overwhelming. Layer toggles must default to **off**. Consider adding a "selected trade only" mode where lifecycle markers only appear for the currently-selected trade in the trade list panel.

### 11.5 Fill rate vs expectancy comparison error

A common mistake: comparing triggered-edge fill rate directly against penetration-25% fill rate as if they are the same concept. They are not. Penetration 25% fill rate = how often price reaches 25% inside the OB. Triggered-edge fill rate = how often, after price triggers, the edge order fills. These denominators are different. Any side-by-side panel should make the denominator explicit in the column header.

### 11.6 Baseline R comparison with different eligible universes

If the triggered-edge CSV omits OBs that were never tapped (backend may not create rows for them), the baseline `eligible` count will differ from a penetration-model CSV which includes all setups. This makes the `deltaVsBaseline` metric unreliable. Mitigation: check whether triggered-edge CSVs include never-tapped rows (confirmed by checking `never_triggered_count > 0` in the funnel). If not, annotate the delta with a "universe mismatch" warning in the UI rather than suppressing the comparison.

### 11.7 `bestByLowest` bug in current analytics

`bestByLowest()` in `entryAnalytics.js` (line 206) uses `>` comparison — it actually finds the **highest** value, not the lowest. For max drawdown (where lower = better), this means `isLowestDD` is tagging the worst drawdown model, not the best. This is a pre-existing bug unrelated to triggered-edge, but it will affect the triggered-edge family rows when they are introduced. Fix before Phase B ships.

---

_End of report. All tasks are audit/design only. No files were modified._
