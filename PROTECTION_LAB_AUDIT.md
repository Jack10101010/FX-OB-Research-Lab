# Protection Lab — Product + UX Audit
**Date:** May 2026  
**Scope:** `ProtectionLab.jsx` + directly imported components  
**Mode:** Additive audit only — no removal recommendations

---

## 1. Files Reviewed

- `frontend/src/pages/ProtectionLab.jsx` (1 778 lines)
- `frontend/src/components/lab/NeonPanel.jsx` — collapsible panel primitive
- `frontend/src/components/lab/MetricChip.jsx` — KPI chip with optional sparkline
- `frontend/src/components/lab/DataTable.jsx` — sortable table with heatmap mode
- `frontend/src/components/lab/EquityCurve.jsx` — `EquityCurve`, `EquityCurveV2` (not imported in ProtectionLab)

---

## 2. Current Strengths

The page is already meaningfully advanced. Notable wins:

- **Confidence tagging system** (Exact / Estimated / Requires) is a genuinely good epistemic design pattern — rare in this space and trustworthy.
- **What-If Filter Simulator** with save/compare/promote workflow is the most differentiated feature — session-level hypothesis testing with named snapshots is genuinely powerful.
- **Dual heatmaps** (hard invalidation + close-confirmed breach) with the Weekday × Hour grid are unusually good. The Origin × Failure Session matrix is a smart cross-dimensional cut.
- **Protection backlog** is intellectually honest — explicitly tracking what would be needed to make each idea exact shows research rigour.
- **Exact simulation result table** with Winners Cut / Loser R Saved / Net vs Baseline columns is commercially publishable-grade.
- **DataTable v2** already supports column sorting and heatmap mode — but these aren't fully utilised in ProtectionLab yet.
- **MetricChip** has a `sparkline` prop and `EquityCurveV2` already has `protection_exit_reason` wired into its tooltip — but neither is used in ProtectionLab.

---

## 3. Missing High-Value Functionality

### 3.1 The Single Biggest Gap: Equity Curve Overlay

**`EquityCurveV2` exists in the codebase, is imported nowhere in ProtectionLab, and already handles `protection_exit_reason` in its tooltip.**

This is the most commercially impactful missing piece. The page answers _"did protection improve net R?"_ with a number, but gives no visual answer to _"did it smooth the ride?"_ Equity curves make drawdown intuitive in a way no number can.

What's needed:
- **Baseline vs Best Protection equity curve overlay** using `EquityCurve`'s `secondary` prop (`netRB` datakey)
- A toggle to cycle through protection modes as the "vs" line
- Optional: EquityCurveV2 with protection-exit dots rendered in a distinct colour (infrastructure is already in the tooltip)

### 3.2 Protection Impact Scatter Plot

Each dot = one trade. X-axis = baseline R outcome. Y-axis = protected R outcome.  
Dots above the diagonal = protection helped. Dots below = protection hurt. Dots on the diagonal = protection did nothing.  
This is the clearest possible answer to "did this protection make good trades worse or only cut bad ones?"  
Colour-code by session or direction for segmentation.

### 3.3 R Distribution Histogram

Overlay the R outcome frequency distributions for baseline vs protection mode.  
Shows whether protection narrows the left tail (good) or clips the right tail (bad).  
Can use Recharts `BarChart` with stacked or adjacent series.

### 3.4 Penetration Threshold Sensitivity Curve

Panel D currently shows 3 hardcoded thresholds (75%, 90%, 100%) in a table.  
A continuous line chart sweeping threshold from 0% to 100% would show exactly where the break-even inflection point is.  
This is a standard quant research tool (sensitivity curve) — its absence is notable.

Add: a range input for sweep min/max/step, then render a Recharts `LineChart` with threshold on X and projected net R on Y.

### 3.5 Per-Trade Protection Drill-Down Inspector

When exact simulation data is present, clicking a trade in the results table should open a trade detail panel showing:
- Trade ID, direction, structure, session
- Baseline R vs Protected R
- Whether protection fired and why (`protection_exit_reason`)
- Fill time → breach time → protection exit time lifecycle
- OB characteristics (width, penetration %, age)

The `protection_exit_reason` field is already filtered in `exactProtectionRow()` to count protection exits — the data is there, just not surfaced.

### 3.6 Protection Mode Comparator (2-Up / N-Up)

The exact results table shows all modes together. A dedicated split-pane view that puts two modes side-by-side with delta-highlighted cells would be faster to reason about.  
Key delta columns: Net R delta, Max DD delta, Expectancy delta, Winners Cut delta.

### 3.7 Drawdown Curve Comparison

Max DD is shown as a single number per mode. A time-series drawdown curve — one line per protection mode — would show whether protection just shifts when the drawdown occurs versus actually reducing it.

### 3.8 Protection Efficiency Ratio

The core protection trade-off is not expressed as a single metric: _"for every 1R I prevented losing, how much winner R did I sacrifice?"_

```
Protection Efficiency = Loser R Saved / Winner R Cut
```

A ratio > 1.0 means protection is net additive. < 1.0 means it's destructive. This should be a prominent column in the exact results table and a headline KPI chip when exact data is present.

### 3.9 Tail Risk Metrics

Missing from the exact results table:
- **CVaR (Conditional Value at Risk)** — average R of the worst N% of trades
- **Worst 5 trades** — sum of the 5 worst individual R outcomes per mode
- **Max consecutive losses** — critical for funded account drawdown rule analysis
- **Profit factor** — gross wins / gross losses (standard institutional metric)

### 3.10 OB Characteristic Breakdown Panels

The what-if filter simulator has filters for OB width and age, but there are no dedicated analytics panels showing how protection / invalidation rate varies by:
- OB width bucket (narrow / medium / wide)
- OB age bucket
- Penetration depth bucket (0–25%, 25–50%, 50–75%, 75–100%)
- Structure type (BOS vs CHoCH)
- Direction (long vs short)

These would answer "is this protection only useful for wide OBs?" or "does it only help on CHoCH entries?" — high-value segmentation questions.

### 3.11 Data Quality Coverage Dashboard

Data readiness warnings are currently scattered as individual `<Note tone="warning">` messages throughout the page. There is no single panel that shows field-by-field coverage as a percentage, making it hard to quickly know whether your dataset is fit for purpose.

A **Data Coverage Panel** at the top of the page showing:

| Field | Coverage | Status |
|---|---|---|
| ob_fully_breached | 84% | Estimated mode only |
| max_ob_penetration_pct | 62% | Partial — Panel D limited |
| close_confirmed_ob_breach | 0% | Requires exporter |
| minutes_to_exit | 91% | Good |

### 3.12 Consecutive Loss / Streak Analysis

Are hard invalidations random or clustered? Streak analysis matters:
- Max consecutive losses (baseline vs each protection mode)
- Run-length distribution of losing streaks
- Visual: a dot-strip chart showing W/L sequence with protection trigger markers

### 3.13 Parameter Sweep Optimizer for What-If

The what-if simulator currently applies individual filters as boolean toggles.  
A **sweep mode** would apply a filter combination across a parameter range — e.g. "what if we exclude the N worst-performing hours?" and show the net R curve as N increases from 0 to 24.  
This would surface the diminishing returns point where filtering starts cutting live-trade volume without meaningful R improvement.

### 3.14 Sankey Trade Lifecycle Flow

A Sankey diagram showing:
- Entry → outcome channel (Win / Loss / Hard Invalidation / Close-Confirmed / Unknown)
- With protection: channel further splits into Protection Exit Saved / Protection Exit Cut Winner

This would be the most visually compelling way to communicate what protection actually does to the trade population.

---

## 4. UX / Information Architecture Redesign

### 4.1 Section Ordering Problem (High Priority)

The current page order is:
1. KPI strip
2. Research Safety legend
3. **Exact simulation results** ← good
4. **What-If Filter Simulator** ← placed before the protection panels
5. Panel A (Baseline)
6. Panel B (Break-even estimate)
7. Panel C (Immediate exit estimate)
8. Panel D (Penetration threshold)
9. Panel E (Fast stopout)
10. Loss Analytics (heatmaps)
11. Session matrix
12. Future protections
13. Backlog

**Problem:** The What-If simulator is placed before the foundational baseline + protection panels. A new user hits the simulator before they understand the baseline — backwards mental model.

**Recommended order:**
1. KPI strip + data quality panel
2. Research Safety legend
3. Exact simulation results (when present)
4. **Equity curve overlay** (new — most important visual)
5. Panel A: Baseline (compact)
6. Panels B / C / D / E: Protection estimates (collapsible when exact data present)
7. What-If Filter Simulator
8. Loss Analytics (heatmaps)
9. Session matrix
10. Future protections (collapsible, defaultCollapsed)
11. Backlog (collapsible, defaultCollapsed)

### 4.2 Collapsibility Not Used (Quick Win)

`NeonPanel` already has `collapsible` and `defaultCollapsed` props — but **zero panels in ProtectionLab use them**.

The page is very long. Every secondary panel should be collapsible. Recommended defaults:
- Panels B, C, D: `collapsible={true}` — show by default when no exact data, collapsed when exact data present
- Panel E (Fast Stopout): `collapsible={true}`
- Future Protections panel: `collapsible={true} defaultCollapsed={true}`
- Protection Backlog: `collapsible={true} defaultCollapsed={true}`
- Loss Analytics panels: `collapsible={true}`

### 4.3 Exploratory Panels Should Visually Recede When Exact Data Is Present

When `hasExactProtection` is true, panels B/C/D/E have "(Exploratory)" appended to their title — but they remain at full visual weight and full size.

When exact data is loaded, these panels should:
- Auto-collapse (using `defaultCollapsed`)
- Gain a lighter border tone
- Show a "Superseded by Exact Data" banner rather than staying prominent

### 4.4 What-If Simulator: Removed Subset Deserves More Prominence

The "Removed Subset" MetricChip (bottom-right of the simulator) shows the net R and expectancy of the excluded trades. This is often the most important number: if the removed trades are _positive R_, the filter is destroying value. If they're _negative R_, the filter is doing its job.

This chip should be larger, more prominent, and tone-coded more aggressively — it's the filter's verdict.

### 4.5 What-If Filter Buttons: Sort by Impact

Filter buttons currently appear in a fixed order. They should be sortable/ordered by trade count impact (highest first) so the most impactful filters are visible without scanning.

Add a "Sort by impact" toggle above the filter groups.

### 4.6 The KPI Strip Is Missing Max Drawdown

The 6 chips show: Trades, Win Rate, Net R, Expectancy, Hard Invalidations, No Hard Invalidation.  
Max Drawdown and Profit Factor are standard institutional metrics that belong here. Consider an 8-chip layout on wide screens or add a secondary row.

### 4.7 Heatmap Cells Are Click-Dead

The heatmap renders `title` attributes but clicking a cell does nothing. Clicking should open a contextual panel or slide-over showing the filtered list of trades for that day × hour combination with their R outcomes and breach details.

### 4.8 Section Dividers / Sticky Group Headers

The page currently has no visual grouping. A sticky section header (e.g. "PROTECTION ANALYSIS", "LOSS ANALYTICS", "RESEARCH") between major groups would dramatically reduce orientation effort on a page this long.

---

## 5. Premium Polish Suggestions

### 5.1 SparkLines on MetricChip — Completely Unused

`MetricChip` already has a `sparkline` prop that renders a mini SVG line chart. It is unused everywhere in ProtectionLab.

The Net R chip should show a micro equity curve sparkline. The Win Rate chip could show win rate over rolling windows. This turns flat numbers into trend-aware at-a-glance data.

### 5.2 Exact Results Table: Highlight Delta Direction in Row Background

When `netVsBaseline > 0` (protection beats baseline), the entire row should have a faint success-toned background. When it underperforms, a faint danger tone. The `UNDERPERFORMS` pill achieves this, but a row-level background is more scannable without reading each pill.

### 5.3 Protection Efficiency Ratio as a Visual Bar

In the exact results table, render the Protection Efficiency ratio (`Loser R Saved / Winner R Cut`) as an inline horizontal bar chart — green fill proportional to the ratio, red for negative. Makes the trade-off instantly scannable.

### 5.4 Heatmap: Add a Column-Sum Row and Row-Sum Column

The heatmap currently shows individual cells. A margin row (sum per hour) and margin column (sum per weekday) would let you instantly identify which hour column or which day row is the biggest contributor to losses — without scanning each cell individually.

### 5.5 DeltaVsBaseline Column: Show as ±Bar Not Just Number

The "Net vs Baseline" column in the exact results table shows a coloured `±X.XR` number. A small inline bar extending left (negative) or right (positive) from a center zero-line would make differences across modes instantly comparable without reading the numbers.

### 5.6 Hover Intelligence on Session Insight Tables

The `MiniInsightTable` components (Session Distribution, Failure Rate by Session, Expectancy by Session) show rows without hover states or tooltips. Hovering a session row should highlight the corresponding row in the heatmap — a cross-highlight interaction that connects the table to the visual.

### 5.7 What-If Simulator: Animate Metric Chip Values on Filter Toggle

When a filter is toggled, the metric chips (Filtered Net R, Filtered WR, etc.) snap to their new values. A brief number-flip animation would make the cause-effect relationship more perceptible.

### 5.8 Confidence Tag System: Extend to Data Cell Level

Currently confidence tags appear only in panel headers. For the exact results table, individual cells that are derived from summary fields (estimated) vs trade-level data (exact) could show a micro confidence indicator — perhaps a subtle underline or icon — so users know which numbers to trust most.

---

## 6. Power User Features

### 6.1 Saved Research Views / Named Snapshots

The what-if simulator saves simulations in local React state, which resets on navigation. Named snapshots should persist to `localStorage` (keyed by run ID), allowing return visits to pick up where you left off.

```
Snapshot = { name, timestamp, activeFilters, savedSimulations, notes }
```

### 6.2 Experiment Journal

Each saved simulation should have an optional notes field for recording conclusions:

> "Simulation 3: Excluded NY + hard invalidation. Net R delta +4.2R. But this removes 31 trades — sample too small for confidence. Revisit with more data."

A small text input next to the Save button, persisted alongside the simulation.

### 6.3 Hypothesis Workbench

The current "Promote to Exact Backtest" workflow copies JSON to clipboard. This is useful but ephemeral. A **Hypothesis Workbench** tab within the simulator would:
- Keep a log of all promoted hypotheses (timestamp, filter set, projected delta)
- Mark each as "Promoted", "Backtested", "Rejected", "In Progress"
- Export the full hypothesis log to CSV for external tracking

### 6.4 Cross-Run Comparison Mode

If a user loads Run A and Run B, they currently have no way to see how protection performs on both runs simultaneously. A cross-run mode would:
- Display exact results tables for two runs side-by-side
- Highlight modes where one run's protection succeeds and the other fails (overfit risk flag)

### 6.5 Custom What-If Filter Builder

The 16 hardcoded what-if filters cover the obvious cases. A custom filter builder using a simple expression UI would allow:
- "Penetration % > 80%"
- "OB width > 8 pips AND session = New York"
- "Trade age > 7 days AND direction = short"

This would require a lightweight expression evaluator but would dramatically expand research flexibility.

### 6.6 Protection Robustness Score

A composite score per protection mode, derived from:
- Net R delta vs baseline
- Max DD improvement
- Winner cut rate (penalty)
- Sample size adequacy (penalty for small n)
- Margin: how far above break-even is the protection?

Score range 0–100. A single "Robustness Score" column in the exact results table that lets you rank modes at a glance.

### 6.7 Export All What-If Simulations to CSV

The exact protection results table has a CSV export button. The what-if comparison table has no export. A single-click export of all saved simulations (including delta vs baseline and filter descriptions) would integrate with external analysis workflows.

### 6.8 Threshold Sweep Range Control for Panel D

Panel D has 3 hardcoded penetration thresholds (75%, 90%, 100%). Add a sweep configurator:
- Min threshold %, Max threshold %, Step %
- Re-runs the sweep on change and re-renders the sensitivity curve

This turns a 3-row lookup table into a continuous research instrument.

---

## 7. Visual Analytics — Missing Charts

All of these should be implementable with the existing Recharts setup already used elsewhere in the lab.

| Chart | Purpose | Priority |
|---|---|---|
| **Equity curve overlay** (baseline vs protected) | Core visual — makes drawdown tangible | Highest |
| **Protection impact scatter plot** | Per-trade baseline vs protected R | High |
| **R distribution histogram** | Compare outcome distributions | High |
| **Penetration sensitivity curve** | How net R changes across thresholds | High |
| **Drawdown curve comparison** | Time-series DD per protection mode | Medium |
| **Delta waterfall** | Decompose net R change: prevented losses − cut winners | Medium |
| **Win/loss streak dot chart** | Consecutive loss visualisation | Medium |
| **Sankey lifecycle flow** | Entry → outcome → protection split | Medium |
| **Protection trigger timing histogram** | Minutes-to-trigger distribution | Low |
| **Heatmap with margin totals** | Sum rows/cols for fast worst-case scanning | Low |

---

## 8. Quick Wins vs Major Bets

### Quick Wins (days of effort each)

1. **Enable `collapsible={true}`** on all secondary panels (B, C, D, E, Future Protections, Backlog). NeonPanel already supports it — zero API change needed.
2. **Auto-collapse panels B/C/D/E when exact data is present** using `defaultCollapsed={hasExactProtection}`.
3. **Add sparkline to Net R MetricChip** — pass rolling equity array to MetricChip's `sparkline` prop. Already supported.
4. **Export what-if simulations table to CSV** — same `downloadCsv` helper already in the file.
5. **Add `protection_exit_reason` column** to the exact results table — data is already computed in `exactProtectionRow`, just not rendered.
6. **Sort what-if filter buttons by trade count** descending — purely cosmetic, no data change needed.
7. **Add Max Drawdown and Profit Factor to the KPI strip** — computed from existing `p` object.
8. **Add margin totals to heatmap** — sum byHour / byDay data already computed in `buildGrid()`.
9. **Add Protection Efficiency Ratio column** (`loserRSaved / winnersCut R`) to exact results table.
10. **Make heatmap cell tooltip a panel-level detail view** (click → filtered trade list) using existing React state.
11. **Add sticky section dividers** between major groups (Protection, Loss Analytics, Future) — pure CSS/markup.
12. **Add `localStorage` persistence** for what-if saved simulations keyed by run ID.

### Medium Upgrades (1–2 weeks each)

1. **Equity curve overlay** (baseline vs protected) using existing `EquityCurve` component with `secondary` prop.
2. **R distribution histogram** via Recharts BarChart — binned R outcomes per mode.
3. **Penetration threshold sensitivity curve** — sweep 0–100% in configurable steps, render as LineChart.
4. **Data quality coverage panel** — field-level completeness percentages from existing data.
5. **OB characteristic breakdown panels** — protection/invalidation rate by width, age, depth, structure.
6. **Protection impact scatter plot** — per-trade X/Y using `exact` trade-level data.
7. **Experiment journal** — notes field on saved simulations + localStorage persistence.
8. **Drawdown curve comparison** using EquityCurveV2 with per-mode data series.

### Major Platform Upgrades (sprints)

1. **Per-trade drill-down inspector with lifecycle timeline** — click any trade in exact results → modal/drawer showing full lifecycle from entry to exit with protection trigger annotation.
2. **Protection Robustness Scoring** — composite score engine with configurable weighting.
3. **Hypothesis Workbench** — persistent log of all promoted hypotheses with status tracking and CSV export.
4. **Cross-run comparison mode** — load two runs and see protection performance diff side-by-side.
5. **Custom filter expression builder** — visual expression UI for arbitrary what-if rules.
6. **Sankey lifecycle flow diagram** — entry → outcome → protection split visual.
7. **Monte Carlo with protection variants** — resample trade sequences to stress-test protection robustness.

---

## 9. Highest ROI Recommendations

These five would individually close the largest gaps between "advanced research page" and "institutional-grade research platform":

**1. Equity Curve Overlay — implement immediately.**  
`EquityCurveV2` is already in the codebase, already handles `protection_exit_reason` in its tooltip, and is imported nowhere in ProtectionLab. This is a missing wire, not a missing feature. The baseline vs protected equity curve is the single most persuasive visual for whether protection improves the strategy — no table of numbers substitutes for seeing the curves.

**2. Protection Impact Scatter Plot.**  
A per-trade scatter of (baseline R, protected R) answers the most important question — "did it only help losers or did it also hurt winners?" — in one glance. This is the chart a quant fund would want to see before approving any protection rule.

**3. Enable Collapsibility + Section Ordering Refactor.**  
The page is very long and sections are not ordered by natural research flow. Collapsibility already exists in NeonPanel. Combining section reordering with collapsible secondary panels would dramatically reduce cognitive load and increase scan speed — especially for experienced users returning to a specific section.

**4. Protection Efficiency Ratio as first-class metric.**  
`Loser R Saved / Winner R Cut` is the core trade-off metric and it's not currently expressed anywhere. Adding it as a column and KPI chip when exact data is present would give the page a single verdict metric rather than requiring the user to divide two columns manually.

**5. What-If Simulator persistence + experiment journal.**  
The simulator is the most differentiated feature, but it's ephemeral — all saved simulations vanish on navigation. `localStorage` keyed by run ID plus a notes field per simulation would turn it from a scratchpad into a research log. This is the single UX change that would make the page feel like a research tool rather than a reporting page.

---

*Audit produced from direct code review of ProtectionLab.jsx (1 778 lines) and supporting components. No implementation changes made.*
