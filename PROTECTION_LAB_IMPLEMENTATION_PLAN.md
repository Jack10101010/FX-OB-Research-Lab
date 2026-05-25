# Protection Lab — Phased Implementation Plan
**Date:** May 2026  
**Based on:** PROTECTION_LAB_AUDIT.md  
**Scope:** Additive upgrades only. No removal. No simplification.

---

## 0. Files to Edit

| File | Action | Reason |
|---|---|---|
| `frontend/src/pages/ProtectionLab.jsx` | Major expansion | All new panels, charts, data transforms, state |

**No other files will be changed.** All chart components (Recharts), analytics helpers, and UI primitives will be added as inline functions inside `ProtectionLab.jsx`, consistent with the existing pattern. The file will grow from 1 778 → ~5 500–6 500 lines.

New recharts symbols needed: `LineChart`, `Line`, `BarChart`, `Bar`, `Cell`, `ScatterChart`, `Scatter`, `XAxis`, `YAxis`, `CartesianGrid`, `Tooltip`, `ResponsiveContainer`, `ReferenceLine`, `AreaChart`, `Area` — all available via the existing recharts dependency used in SweepLab, RunDetail, MonteCarlo, and WalkForwardLab. Import added at top of file.

`EquityCurveV2` imported from `@/components/lab/EquityCurve` — already in the lab, already handles `protection_exit_reason` in its tooltip. Zero API change needed.

---

## 1. Data Dependency Map

### 1a. Always available from TRADES array

| Field | Used for |
|---|---|
| `t.r` / `t.pnl_r` | All R calculations |
| `t.outcome` | Win/Loss classification |
| `t.ob_fully_breached` | Hard invalidation flag |
| `t.max_ob_penetration_pct` | Penetration depth |
| `t.fill_time` / `t.entry_time` etc | Timestamps, session derivation |
| `t.direction` / `t.side` | Long/short breakdown |
| `t.structureTag` / `t.structure` | BOS/CHoCH breakdown |
| `t.obWidthPips` | OB width breakdown |
| `t.obOriginSession` / `t.obOriginTime` | Origin session |
| `t.minutes_to_exit` | Fast stopout, trigger timing |
| `t.same_candle_exit` | Fast stopout bucket |
| `t.id` | Trade pairing (best-effort) |

### 1b. Available when exact simulation loaded (activeRun.protectionResults)

| Field | Path | Used for |
|---|---|---|
| Trade arrays per mode | `.tradesByMode[mode][]` | Equity curves, scatter, histogram, paired table |
| `t.r` on protected trades | `.tradesByMode[mode][].r` | Protected R outcomes |
| `t.protection_exit_reason` | `.tradesByMode[mode][].protection_exit_reason` | Trigger reason column, trigger histogram |
| `t.id` on protected trades | `.tradesByMode[mode][].id` | Trade pairing with baseline |
| `summary.loser_r_saved` | `.summary.*` | Efficiency ratio, waterfall |
| `summary.winners_cut` | `.summary.*` | Efficiency ratio, waterfall |
| `summary.net_vs_baseline` | `.summary.*` | Robustness score |
| `summary.max_dd` | `.summary.*` | Robustness score, drawdown comparison |

### 1c. Requires exporter data — NOT in current dataset

| Feature needing it | Missing field | Graceful state |
|---|---|---|
| Exact BE escape simulation | intratrade return-to-entry timestamp | "Requires exporter data" placeholder |
| Exact penetration exit price | candle-level exit price | Estimated cap-at-0R remains |
| News blackout overlay | news calendar import | Existing FutureCard placeholder |
| Pre-fill invalidation cancel | pre-fill lifecycle | Existing FutureCard placeholder |
| Full trade lifecycle timeline | entry→breach→exit timestamps | Drawer shows available fields only |
| Close-confirmed heatmap | `close_breach_time` / `close_confirmed_ob_breach` | Existing "Limited Data" state |

### 1d. Derivable from existing data (new computed fields)

| New computed field | How derived | Used for |
|---|---|---|
| `p.maxDD` | `maxDrawdownR(trades)` — function already exists | KPI strip chip |
| `p.profitFactor` | `Σ(r>0) / |Σ(r<0)|` | KPI strip chip |
| `p.equityPoints` | Rolling cumulative R array | Net R sparkline |
| `p.rBins` | Bin trades by R into buckets | R distribution histogram (baseline) |
| `p.winStreak` / `p.lossStreak` | Sequential scan of trade outcomes | Streak chart |
| `row.efficiencyRatio` | `loserRSaved / |netVsBaseline - loserRSaved|` | Efficiency column |
| `row.robustnessScore` | Composite — see §3 below | Robustness column |
| `row.winnerRCost` | `netVsBaseline - loserRSaved` | Waterfall chart |
| Equity curve per mode | Rolling cumulative R from `tradesByMode[mode]` | Equity overlay, drawdown comparison |
| Paired trade rows | Join `TRADES` ↔ `tradesByMode[mode]` on `t.id` | Paired table, scatter plot |
| Coverage percentages | `count(field != null) / n * 100` | Data quality panel |
| Penetration sweep | Loop 0→100 on existing `max_ob_penetration_pct` data | Sensitivity curve |
| OB width buckets | `t.obWidthPips` → narrow/medium/wide/extra-wide | OB breakdown panel |

---

## 2. Efficiency Ratio Derivation (key formula)

From existing `exactProtectionRow` fields:
```
loserRSaved      = R recovered by preventing losses (always positive if present)
netVsBaseline    = net R change vs baseline
winnerRCost      = netVsBaseline - loserRSaved   ← negative if winners were cut
efficiencyRatio  = loserRSaved / |winnerRCost|   ← only meaningful if winnerRCost < 0

Interpretation:
  > 1.0  → saves more R from losers than it costs from winners  ← net positive
  = 1.0  → break-even
  < 1.0  → costs more in winner R than it saves from loser R   ← net destructive
  ∞      → no winner cost at all (loserRSaved > 0, winnerRCost = 0)
```

Shows as "—" if `loserRSaved` or `netVsBaseline` not present in summary.

---

## 3. Robustness Score Formula

Composite 0–100 score per protection mode (only when exact data present):

```
component 1: netDelta   = clamp(netVsBaseline * 8,  -40, +40)
component 2: ddDelta    = clamp((baselineMaxDD - modeMaxDD) * 4, -20, +20)
             ↑ positive if mode has lower drawdown than baseline
component 3: efficiency = efficiencyRatio > 1.5 ? +15
                        : efficiencyRatio > 1.0 ? +8
                        : efficiencyRatio > 0.5 ? 0
                        : -10
component 4: sample     = clamp((trades - 20) * 0.5, -15, 0)
             ↑ penalty for fewer than 20 trades; 0 if ≥ 20

score = clamp(50 + sum(components), 0, 100)
```

Display: coloured badge (0–39 = danger, 40–59 = warning, 60–79 = primary, 80–100 = success)

---

## 4. Trade Pairing Strategy (Paired Table + Scatter)

Baseline trades = `TRADES` array  
Protected trades = `activeRun.protectionResults.tradesByMode[selectedMode]`

**Pairing approach (ordered priority):**
1. Match on `t.id` (string equality) — most reliable
2. Match on `t.trade_id` — alternate field name
3. Match on array index (position-ordered) — fallback, works if Python outputs same trade order
4. If no match possible: show "No pairing data" empty state

**Graceful degradation:**
- If < 50% of trades pair by ID → warn user and fall back to index-based
- If 0 trades in selected mode → show empty state "No exact protection pair data — import a protection simulation CSV"

---

## 5. Phase 1 — Foundation + Quick Wins
**Risk: LOW | Estimated size: ~800 lines added**

All changes are purely additive. No existing code path changes. No new external dependencies.

### P1.1 — Recharts + EquityCurveV2 import
```js
import {
    LineChart, Line, BarChart, Bar, Cell, ScatterChart, Scatter,
    XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    ReferenceLine, AreaChart, Area, ComposedChart
} from "recharts";
import { EquityCurveV2 } from "@/components/lab/EquityCurve";
```
Additional lucide icons: `Database`, `Layers`, `Crosshair`, `Zap`, `BookOpen`, `FlaskConical`, `Award`, `BarChart2`, `Sliders`

### P1.2 — buildProtection() expanded output
Add to the return object of `buildProtection()`:
- `maxDD: maxDrawdownR(list)`
- `profitFactor`: `Σ(r>0) / |Σ(r<0)|` or null if no losses
- `equityPoints`: `[{i, netR}]` rolling cumulative R (for sparkline)
- `rBins`: 11 bins from -5R to +5R (step 1R) with count per bin
- `winStreak` / `lossStreak` / `streakData`: sequential scan of outcomes
- `obBreakdown`: groupings by width bucket, age bucket, penetration depth, structure, direction

**`obBreakdown` shape:**
```js
{
  byWidth:   [{ label, count, netR, winRate, breachRate }],  // narrow/medium/wide/extra-wide
  byAge:     [{ label, count, netR, winRate, breachRate }],  // <4h / 4–12h / 1–3d / 3–7d / 7–14d / 14d+
  byDepth:   [{ label, count, netR, winRate }],              // 0–25% / 25–50% / 50–75% / 75–100%
  byStructure: [{ label, count, netR, winRate, breachRate }], // bos / choch / unknown
  byDirection: [{ label, count, netR, winRate, breachRate }], // long / short
}
```

### P1.3 — exactProtectionRow() + buildExactProtectionRows() expansion
Add to `exactProtectionRow` return:
- `efficiencyRatio`: derived from formula §2 above
- `winnerRCost`: `netVsBaseline - loserRSaved` (negative = cost)
- `robustnessScore`: derived from formula §3 above
- `protectionExitReasons`: `{[reason]: count}` map from `tradesByMode` trades

Add `buildExactProtectionRows` to also compute:
- `baselineMaxDD` (from `p.maxDD` passed in) — for robustness score DD component

### P1.4 — buildDataQuality() new function
```js
function buildDataQuality(trades) {
  // Returns coverage percentages for key fields
  // Fields checked: ob_fully_breached, max_ob_penetration_pct, 
  //   close_confirmed_ob_breach, close_breach_time,
  //   minutes_to_exit, same_candle_exit, obWidthPips,
  //   obOriginSession, protection_exit_reason
}
```

### P1.5 — Section ordering refactor (JSX only)
New page order:
1. `<ActiveRunContext />` (unchanged)
2. KPI strip — 8 chips (adds Max DD + Profit Factor)
3. Data Quality Coverage panel (new, collapsible defaultCollapsed)
4. Research Safety legend (unchanged)
5. Exact Protection Simulation Results table (unchanged position, enhancements)
6. *(Equity overlay — Phase 2)*
7. Section divider: "BASELINE + PROTECTION ESTIMATES"
8. What-If Filter Simulator (moved after exact results, before estimates)
9. Panel A — Baseline (unchanged)
10. Panels B / C / D / E — `collapsible={true}`, `defaultCollapsed={hasExactProtection}`
11. Section divider: "LOSS ANALYTICS"
12. Hard invalidation heatmap + insights (unchanged)
13. Close-confirmed heatmap (unchanged)
14. Failure session breakdown (unchanged)
15. Origin × Failure matrix (unchanged)
16. Section divider: "OB CHARACTERISTICS" (new, Phase 2)
17. Section divider: "VISUAL ANALYTICS" (new, Phase 2)
18. Section divider: "POWER USER TOOLS" (new, Phase 3)
19. Future Protections — `collapsible={true} defaultCollapsed={true}`
20. Protection Backlog — `collapsible={true} defaultCollapsed={true}`

### P1.6 — KPI strip expanded (8 chips)
Grid: `grid-cols-2 md:grid-cols-4 lg:grid-cols-8`
- Trades (unchanged)
- Win Rate (unchanged)
- Net R — add `sparkline={p.equityPoints.map(pt => pt.netR)}` (mini equity sparkline)
- Expectancy (unchanged)
- Max DD (new — from `p.maxDD`)
- Profit Factor (new — from `p.profitFactor`)
- Hard Invalidations (unchanged)
- No Hard Invalidation (unchanged)

### P1.7 — Exact results table columns added
New columns after existing columns:
- `protection_exit_reason` (dominant reason from `row.protectionExitReasons`)
- `efficiencyRatio` (rendered as colored number: green ≥1, red <1, "—" if not available)
- `robustnessScore` (colored badge 0–100)
New row-level behavior:
- Row background: faint success if `netVsBaseline > 0`, faint danger if `underperforms`
- Delta column: render as inline ±bar (10px bar extending left/right from center)

### P1.8 — Heatmap improvements
**Margin totals:**
- Add bottom row "TOTAL" showing sum per hour column (`grid.byHour[h].count`)
- Add right column "Σ" showing sum per weekday row (`grid.byDay[d].count`)
- Both use muted tone, no heatmap colouring

**Cell click drilldown:**
- Add `[selectedHeatmapCell, setSelectedHeatmapCell]` state
- Clicking a cell sets `{day, hour}` — fires a `onCellClick` callback
- Below heatmap: inline `HeatmapCellDrilldown` component showing filtered trade list
  - Columns: fill_time (UTC), direction, R, outcome, ob_fully_breached
  - Max 20 rows shown, "Show all N" if more

### P1.9 — What-if simulator persistence + notes
**localStorage persistence:**
```js
const LS_WHATIF_KEY = (runId) => `protlab_whatif_${runId || "default"}`;
// On mount: load saved simulations from localStorage for current runId
// On save: persist updated array to localStorage
// On run change (baselineSignature changes): reload from localStorage for new run
```

**Notes field per simulation:**
- In `WhatIfResultsTable`, for saved rows: add a textarea/input field for notes
- Notes stored in the simulation object: `{ ...sim, notes: "" }`
- Rendered as a small expandable text area below the row

**Export saved simulations to CSV:**
- New button: "Export All Simulations CSV"
- Exports: label, filters applied, n trades, removed count, net R, expectancy, max DD, delta vs baseline, notes

### P1.10 — Sort what-if filters by impact
- Toggle button: "Sort by impact" above the filter group columns
- When active: re-sorts filters within each group descending by `result.filterCounts[filter.key]`

### P1.11 — SectionDivider component
```jsx
function SectionDivider({ label, icon: Icon, sub }) {
  // Sticky top div with accent line + section label
  // Subtle cyan line left border, uppercase mono label
  // Optional sub-label (e.g. "Requires exporter data for all panels")
}
```
Used between major page sections with `position: sticky; top: 0; z-index: 10`.

### P1.12 — Data quality coverage panel
New `NeonPanel` near top of page, `collapsible={true} defaultCollapsed={true}`:
- Title: "Data Coverage · Field Completeness"
- Grid of coverage bars — one row per field
- Each row: field name, `████░░░░` progress bar, percentage, status tag
- Status: "Good (>80%)", "Partial (40–80%)", "Limited (<40%)", "Missing (0%)"
- Bottom summary: "N / 9 fields have good coverage"

---

## 6. Phase 2 — Visual Analytics
**Risk: MEDIUM | Estimated size: ~1 200 lines added**

All new, self-contained chart components. Each wrapped in a `NeonPanel` with `collapsible={true}`. No existing code modified except the JSX render order to insert them.

### P2.1 — Equity Curve Overlay
**Component: `EquityOverlayPanel`**  
**Data:** `buildEquityCurveData(trades, tradesByMode, selectedMode)`  
**Chart:** EquityCurveV2 — baseline line (primary colour) + protected line (secondary colour)  

Wait — EquityCurveV2 renders one equity curve with per-trade dots. It doesn't natively support two curves. Use simpler `EquityCurve` (v1) which has a `secondary` prop rendering a second `Area` with `dataKey="netRB"`.

Data shape needed:
```js
[{ i, label, netR, netRB }]
// netR = baseline cumulative R at trade i
// netRB = protected cumulative R at trade i (null if no protection data)
```

**UI:**
- Mode selector: dropdown/button group to choose which protection mode to overlay
- Shows "No protection data loaded" empty state if no exact simulation
- Legend: "Baseline" (cyan) vs "Protected: {mode}" (orange/secondary)
- Positioned: after exact results table, before panels A–E

### P2.2 — Protection Impact Scatter Plot
**Component: `ProtectionImpactScatter`**  
**Data:** `buildPairedTrades(trades, tradesByMode, selectedMode)` — pairs by ID then index  
**Chart:** Recharts `ScatterChart` with custom dot renderer  

- X-axis: Baseline R (range: min to max of baseline R values, symmetric ±)
- Y-axis: Protected R (same range)
- Reference line: Y=X diagonal (protection made no difference)
- Dots above diagonal → success fill (cyan), below → danger fill (red)
- Reference lines at X=0 and Y=0
- Tooltip: trade ID, baseline R, protected R, delta, protection_exit_reason
- Empty state: "No exact protection pair data — import a protection simulation"
- Collapsible, default open when exact data present

### P2.3 — R Distribution Histogram
**Component: `RDistributionHistogram`**  
**Data:** bin trades by R into buckets: `≤-3R, -3 to -2, -2 to -1, -1 to 0, 0 to 1, 1 to 2, 2 to 3, >3R`  

- Side-by-side bars: baseline (cyan, low opacity) vs selected protection mode (orange)
- X-axis: R bucket label
- Y-axis: count
- Tooltip: count for each series per bucket
- Empty state: "Requires protection simulation data for comparison"

### P2.4 — Penetration Threshold Sensitivity Curve
**Component: `PenetrationSensitivityCurve`**  
Replaces/extends Panel D:

- Keep existing static DataTable (shown when no sweep data)
- Add: range inputs: Min threshold (default 50%), Max (default 100%), Step (default 5%)
- "Run Sweep" button computes net R delta for all thresholds in range
- Chart: `LineChart` with threshold on X, projected net R on Y
- Reference line at baseline net R (horizontal)
- Annotate: break-even threshold (where line crosses baseline)
- Note: "Estimated — uses flag-based cap at 0R, not candle-level simulation"
- If `penKnown < n * 0.4` → show "Insufficient penetration data" empty state

### P2.5 — Delta Waterfall Chart
**Component: `ProtectionDeltaWaterfall`**  
**Only shows when exact data present**

For each non-baseline protection mode:
- 3-segment waterfall: "Prevented Losses" (positive, green) | "Cut Winners" (negative, red) | "Net Delta" (result, green/red)
- X-axis: mode names
- Y-axis: R
- Tooltip: exact values
- Empty state: "Requires exact simulation data with loser_r_saved and winners_cut fields"

### P2.6 — Win/Loss Streak Chart
**Component: `WinLossStreakChart`**  

- Horizontal dot strip showing W/L sequence of baseline trades
- Win = cyan dot, Loss = red dot
- Hard invalidation = red dot with alert icon
- Protection exit = orange marker (on protected trades if available)
- Hover: trade index, date, R, session
- Shows max consecutive loss run highlighted
- Toggle: "Baseline" vs "Protected: {mode}" if exact data present

### P2.7 — Trigger-Time Histogram (Fast Stopout Extension)
**Component: `TriggerTimeHistogram`**  
**Data:** Protection exit trades filtered from `tradesByMode` — their `minutes_to_exit`

- BarChart of minutes_to_exit distribution for ONLY protection-exit trades
- Bins: <5m, 5–15m, 15–30m, 30–60m, 1–2h, 2–4h, 4h+
- Overlaid: same distribution for all losing trades (baseline)
- "When do protection exits happen vs regular losses?"
- Empty state: "Requires protection simulation with protection_exit_reason field"

### P2.8 — Drawdown Comparison Chart
**Component: `DrawdownComparisonChart`**  

- LineChart showing drawdown depth over trade index
- One line per protection mode (max 4 modes to prevent clutter)
- Baseline line in cyan, protection modes in other colours
- Y-axis: R drawdown (negative = below zero)
- Tooltip: trade index, baseline DD, protected DD
- Empty state: "Requires exact simulation data"

### P2.9 — OB Characteristic Breakdown Panels
**Component: `OBCharacteristicBreakdowns`**  
**Data:** `p.obBreakdown` (computed in P1.2)

Tabs inside a single NeonPanel: "Width", "Age", "Depth", "Structure", "Direction"

Each tab shows:
- DataTable with columns: bucket label, count, net R, win rate, breach rate
- Heatmap mode on net R column
- Summary insight row at bottom: "Hardest-hit bucket: X (N% of hard invalidations)"
- Empty state per tab if insufficient data for that field

---

## 7. Phase 3 — Power User Features
**Risk: MEDIUM-HIGH | Estimated size: ~1 200 lines added**

### P3.1 — Baseline ↔ Protected Paired Trade Table
**Component: `PairedTradeTable`**  
**Data:** `buildPairedTrades()` from P2.2 (reuse)

- Full-width DataTable with columns:
  - Trade ID (from `t.id` or index)
  - Direction (long/short)
  - Session (derived from fill_time)
  - Structure (BOS/CHoCH)
  - Baseline R (ColoredR)
  - Protected R (ColoredR or "—")
  - Delta R (ColoredR with + prefix)
  - Protection Fired? (Yes/No pill)
  - Trigger Reason (`protection_exit_reason` or "—")
- Default sort: Delta R ascending (worst at top)
- Filter bar: "Only protection exits", "Only changed outcomes", "Only losses"
- Empty state: "No exact protection data — import a protection simulation"
- Collapsible, defaultCollapsed

### P3.2 — Per-Trade Drilldown Drawer
Triggered by clicking a row in PairedTradeTable or the scatter plot:

- Right-side slide panel (pure CSS/state, no external library)
- Shows: trade ID, date/time, direction, session, structure, OB width, OB age, penetration %, hard invalidation flag, baseline R, protected R, protection_exit_reason
- "Lifecycle timeline" section: entry time shown, breach time if available, "Exit timeline requires exporter data" if close_breach_time present
- Closes on Escape or overlay click

### P3.3 — Protection Mode Comparison Matrix
**Component: `ProtectionModeMatrix`**  
**Only shown when exact data present**

- Full-width grid: rows = protection modes, columns = metrics
- Columns: Net R, vs Baseline, Max DD, Expectancy, Win Rate, Efficiency Ratio, Robustness Score, Protection Exits, Winners Cut, Loser R Saved
- Each cell: heatmap coloured (green = good, red = bad, scaled per column)
- Row for baseline highlighted (secondary accent)
- Best value per column highlighted with a ★ marker
- Sortable by clicking column header
- "Why this matters" subtitle: "Compare all modes at a glance — green means better than column average"

### P3.4 — Hypothesis Workbench
**Component: `HypothesisWorkbench`**  
**Storage:** `localStorage` key `protlab_hypotheses_{activeRunId}`

The "Promote to Exact Backtest" button in the existing WhatIfFilterSimulator currently copies JSON to clipboard. This feature intercepts that action to ALSO save to the workbench log.

Workbench panel contains:
- Table of all promoted hypotheses with columns:
  - Timestamp
  - Hypothesis name (editable inline)
  - Filter summary (e.g. "Exclude NY fills, Exclude 15:00 UTC")
  - Projected Net R delta
  - Status chip: "Pending" / "Backtested" / "Rejected" — user-settable
  - Notes (expandable textarea)
- Actions per row: copy JSON, change status, delete
- "Clear all" button
- "Export workbench to CSV" button
- Empty state: "No hypotheses promoted yet — use the What-If Filter Simulator to promote ideas"

### P3.5 — Experiment Journal (Enhanced what-if notes)
This is the notes field from P1.9, elevated with:
- Notes visible in the main saved simulations table (truncated, expand on click)
- "Conclusion" dropdown: None / Promising / Needs more data / Rejected
- Conclusion shown as a coloured pill on the row
- Filter: "Show only Promising" toggle

---

## 8. Deferred Features (Not in this implementation pass)

| Feature | Reason for deferral |
|---|---|
| Cross-run comparison mode | Requires multi-run state management beyond ProtectionLab scope; separate sprint |
| Custom filter expression builder | Language parser complexity; ~2–3 sprints standalone |
| Sankey lifecycle flow | Requires full entry→breach→exit→outcome lifecycle data from exporter; blocked |
| Monte Carlo with protection variants | Separate dedicated page already exists — per instructions |
| News blackout overlay | Requires news calendar data import from external source |
| Pre-fill invalidation cancel | Requires pending-order lifecycle from exporter |
| Per-trade intratrade return-to-entry BE exact | Requires new exporter field |
| Candle-level penetration exit prices | Requires new exporter field |

---

## 9. Risk Assessment Per Feature

| Feature | Phase | Risk | Reason |
|---|---|---|---|
| Collapsible panels | 1 | **Zero** | NeonPanel prop already exists |
| Section ordering | 1 | **Zero** | Pure JSX reorder |
| KPI expansion | 1 | **Low** | New computations on existing data |
| Data quality panel | 1 | **Low** | New readonly display |
| Heatmap margin totals | 1 | **Low** | Additive to WeekHourHeatmap render |
| Heatmap cell drilldown | 1 | **Low** | New state + inline filter |
| What-if localStorage | 1 | **Low** | Isolated state, keyed by runId |
| What-if notes + export | 1 | **Low** | Additive UI on existing component |
| exactProtectionRow expansions | 1 | **Low** | Additive return fields, no logic change |
| Efficiency ratio column | 1 | **Low** | Derived from existing fields |
| Robustness score column | 1 | **Low** | Formula on existing fields |
| Row backgrounds in exact table | 1 | **Low** | CSS addition only |
| buildProtection() expansion | 1 | **Low** | Additive only, existing logic untouched |
| Equity curve overlay | 2 | **Medium** | New import + data transform, well-defined |
| Protection impact scatter | 2 | **Medium** | Trade pairing may have gaps — graceful fallback |
| R distribution histogram | 2 | **Low-Medium** | New Recharts component, clean data |
| Penetration sensitivity curve | 2 | **Low-Medium** | Extends existing Panel D data |
| Delta waterfall | 2 | **Low-Medium** | Uses pre-computed summary fields |
| Win/loss streak chart | 2 | **Low** | Simple sequential render |
| Trigger-time histogram | 2 | **Medium** | Needs protection exit trade filtering |
| Drawdown comparison | 2 | **Medium** | New per-mode curve data transform |
| OB characteristic breakdown | 2 | **Low-Medium** | New grouping on existing fields |
| Paired trade table | 3 | **Medium** | Trade pairing uncertainty |
| Per-trade drawer | 3 | **Medium** | New panel UI, graceful data fallbacks |
| Protection mode matrix | 3 | **Low-Medium** | Derives from existing exactProtectionRows |
| Hypothesis workbench | 3 | **Medium** | New state model, localStorage |
| Experiment journal enhancements | 3 | **Low** | Additive to existing what-if state |

---

## 10. Implementation Order Within Each Phase

### Phase 1 implementation order
1. `buildProtection()` expansion (P1.2) — data foundation
2. `exactProtectionRow()` / `buildExactProtectionRows()` expansions (P1.3)
3. `buildDataQuality()` (P1.4)
4. New imports (P1.1)
5. `SectionDivider` component (P1.11)
6. KPI strip expansion (P1.6)
7. Exact results table enhancements (P1.7)
8. Data quality panel (P1.12)
9. Heatmap margin totals (P1.8 partial)
10. Heatmap cell drilldown (P1.8 partial)
11. What-if simulator localStorage + notes + export + filter sort (P1.9, P1.10)
12. Section ordering refactor + collapsibility (P1.4, P1.5)

### Phase 2 implementation order
1. `buildEquityCurveData()` + `buildPairedTrades()` helper functions
2. Equity curve overlay panel (P2.1)
3. Protection impact scatter (P2.2)
4. R distribution histogram (P2.3)
5. Penetration sensitivity curve (P2.4)
6. Delta waterfall (P2.5)
7. Win/loss streak chart (P2.6)
8. Drawdown comparison (P2.8)
9. Trigger-time histogram (P2.7)
10. OB breakdown tabs (P2.9)

### Phase 3 implementation order
1. `buildPairedTrades()` — refine from Phase 2
2. Paired trade table (P3.1)
3. Per-trade drilldown drawer (P3.2)
4. Protection mode comparison matrix (P3.3)
5. Hypothesis workbench (P3.4)
6. Experiment journal enhancements (P3.5)

---

## 11. Page Section Layout (Final)

```
ActiveRunContext
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
KPI Strip (8 chips) [Net R has sparkline]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Data Coverage Panel [collapsible, defaultCollapsed]
Research Safety Legend
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
──── SECTION: EXACT SIMULATION RESULTS ──── [sticky]
Exact Protection Simulation Table [when present]
  + protection_exit_reason column
  + Efficiency Ratio column
  + Robustness Score column
  + row backgrounds
Protection Mode Comparison Matrix [Phase 3, exact only]
Paired Trade Table [Phase 3, exact only]
Per-trade Drilldown Drawer [Phase 3, slides in from right]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
──── SECTION: VISUAL ANALYTICS ──── [sticky]
Equity Curve Overlay [Phase 2]
Protection Impact Scatter Plot [Phase 2, exact only]
R Distribution Histogram [Phase 2]
Drawdown Comparison Chart [Phase 2, exact only]
Delta Waterfall [Phase 2, exact only]
Win/Loss Streak Chart [Phase 2]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
──── SECTION: BASELINE + PROTECTION ESTIMATES ──── [sticky]
What-If Filter Simulator [enhanced — localStorage, notes, export]
Panel A: Baseline [unchanged]
Panel B: Break-even Escape [collapsible, auto-collapses when exact data]
Panel C: Immediate Exit [collapsible, auto-collapses when exact data]
Panel D: Penetration Threshold [+ sensitivity curve in Phase 2]
Panel E: Fast Stopout [collapsible]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
──── SECTION: LOSS ANALYTICS ──── [sticky]
Hard Invalidation Heatmap [+ margin totals, + cell drilldown]
Close-Confirmed Heatmap [unchanged]
Failure Session Breakdown [unchanged]
Origin × Failure Matrix [unchanged]
Trigger-Time Histogram [Phase 2, exact only]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
──── SECTION: OB CHARACTERISTICS ──── [sticky, Phase 2]
OB Breakdown (Width / Age / Depth / Structure / Direction tabs)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
──── SECTION: POWER USER TOOLS ──── [sticky, Phase 3]
Hypothesis Workbench [localStorage]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Future Protections [collapsible, defaultCollapsed=true]
Protection Backlog [collapsible, defaultCollapsed=true]
```

---

## 12. What Requires Exporter / Backend (Summary)

The following panels/features will show a graceful empty state with a clear explanation rather than fake data:

| Panel | Empty state message |
|---|---|
| Equity curve overlay (protected line) | "Import a protection simulation to overlay the protected equity curve" |
| Protection impact scatter | "No exact protection pair data — requires protection simulation CSV" |
| R distribution histogram (protected bars) | "Requires protection simulation data for comparison overlay" |
| Drawdown comparison (protected lines) | "Requires exact simulation data" |
| Delta waterfall | "Requires exact simulation with loser_r_saved and winners_cut in summary" |
| Trigger-time histogram | "Requires protection simulation with protection_exit_reason field" |
| Paired trade table | "No exact protection pair data — import a protection simulation" |
| Per-trade lifecycle timeline in drawer | "Full lifecycle timeline requires exporter fields: return_to_entry_time, breach_candle_price" |
| Data quality panel fields | Shows 0% / Missing for fields not present in dataset |

---

## 13. Implementation Notes + Constraints

**File length management:**
The file will grow large (~5 500–6 500 lines). Sections are separated by clear `// ── Section Name ────` banners. Component functions are grouped logically. All helper functions remain at the bottom, analytics in the middle, UI components above.

**No fake data:**
All charts show honest empty states. No hardcoded sample numbers. `buildProtection()` and all analytics return explicit null/undefined for missing fields — never a made-up fallback value.

**localStorage key strategy:**
```
protlab_whatif_{activeRunId}   — what-if saved simulations per run
protlab_hypotheses_{activeRunId} — promoted hypotheses per run
```
If `activeRunId` is null, falls back to `"default"`. On run change, loads the correct store.

**Recharts tooltip consistency:**
All new charts use the same `TT_STYLE` object (from EquityCurveV2 pattern):
```js
const TT_STYLE = {
    background: "hsl(var(--panel-2))",
    border: "1px solid hsl(var(--accent-primary) / 0.4)",
    borderRadius: 2,
    fontFamily: "JetBrains Mono",
    fontSize: 11,
    padding: "8px 10px",
}
```

**Colour consistency:**
- Baseline: `hsl(var(--accent-primary))` (cyan)
- Protected/comparison: `hsl(var(--accent-secondary))` (teal/orange)
- Win/positive: `hsl(var(--success))`
- Loss/negative: `hsl(var(--danger))` / `hsl(var(--bear))`
- Neutral: `hsl(var(--muted))`

---

*Plan ready. Awaiting approval to proceed with Phase 1 implementation.*
