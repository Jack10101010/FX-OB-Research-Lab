# FTMO 2-Step Equity Chart Overlay — Audit Report

> **Status: AUDIT ONLY — no files modified.**
> Date: 2026-06-02

---

## 1. Files Read

| File | Purpose |
|------|---------|
| `frontend/src/components/lab/EquityCurve.jsx` | Chart render — `EquityCurveV2`, y-domain, tooltip, dot colouring |
| `frontend/src/components/lab/account/fundingChallenge.js` | FTMO sim — `simulateFundingChallenge`, `buildFundingChallengeEquityCurve` |
| `frontend/src/components/lab/account/accountEquity.js` | Base curve — `buildAccountEquityCurve`, `summarizeAccountEquity` |
| `frontend/src/pages/RunDetail.jsx` | Run Workspace — chart data derivation, metric cards, UI controls |
| `frontend/src/components/lab/account/AccountSettingsPanel.jsx` | Account config editor |
| `frontend/src/lib/metrics.js` | Legacy metric utilities (for context) |
| `equity-curve-upgrade-design.md` | Prior design doc |

---

## 2. Current Data Flow

```
validTradesForRun (all valid, unfiltered)
  └─→ accountSummary (summarizeAccountEquity)     → top KPI strip (Net PnL, Max DD, etc.)
  └─→ fundingChallenge (simulateFundingChallenge) → FundingPhaseCard panels

filteredTradesForEquity (chart-filter subset of validTradesForRun)
  └─→ [if useFundingPhaseChart]
        buildFundingChallengeEquityCurve(filteredTrades, accountSettings, fundingSettings)
          └─→ simulateFundingChallenge (re-runs on filtered subset)
                └─→ evaluatePhase → buildAccountEquityCurve (starts fresh from startingBalance each phase)
                └─→ buildPhasePoints → array of { netR=equityAfter(dollars), drawdown=accountDrawdownAmount(dollars), ... }
          └─→ withPhaseStart → injects start-anchor points with fundingMarker flags
          └─→ markerForPoint → tags boundary points (phase_1_pass, phase_2_start, phase_2_pass, funded_start)
      → equityChartData (dollar-valued netR, dollar-valued drawdown)
  └─→ [else]
        synthetic startPoint + buildAccountEquityCurve / cumulative R
      → equityChartData (same shape)

equityChartData → EquityCurveV2 (receives only data[], height, showDots, showDrawdown, showNews)
  └─→ yDomain = [min(minNetR, 0) - pad, maxNetR + pad]  ← ALWAYS includes 0
  └─→ YAxis tickFormatter: "${value}R"                   ← always "R" suffix
  └─→ ReferenceLine y={0}                                ← only line on chart
  └─→ dotFill() reads fundingMarker/fundingPhase         ← dot colour correct
  └─→ TradeTooltip: fmtR(netR), fmtR(drawdown)          ← formats dollars as R
```

**`useFundingPhaseChart` gate (RunDetail L451):**
```js
const useFundingPhaseChart =
  fundingSettings.enabled && accountModeEnabled && fundingChartMode === "funding_phase";
```
Overlay is fully disabled in R-only mode. When in "Continuous Account Equity" chart mode, the standard account equity path is shown instead of the phase-reset curve.

---

## 3. Current Bugs and Mismatches

### Bug 1 — Y-axis domain forces 0, crushing the equity line (Critical)

**Location:** `EquityCurve.jsx` L242-253 (`yDomain` useMemo)

```js
const domainMin = Math.min(minVal, 0) - pad;
```

When FTMO overlay is active, `netR` values are account dollar amounts (e.g., 90,000–110,000). `Math.min(90000, 0)` returns `0`, so `domainMin ≈ -1000`. The y-axis spans roughly -1,000 to 110,000. The entire equity line — which lives between 90,000 and 110,000 — is compressed into the top ~9% of the chart area. This is the primary visual breakage. The account baseline and the loss floor are both invisible.

### Bug 2 — Y-axis tick labels say "R" in dollar mode (Major)

**Location:** `EquityCurve.jsx` L370-376 (`YAxis tickFormatter`)

```js
tickFormatter={(v) => `${...}R`}
```

Always appends "R". When the FTMO overlay is active and `netR` is in dollars, all ticks render as "100000R", "105000R", etc.

### Bug 3 — No reference lines for challenge levels on the chart (Major)

**Location:** `EquityCurve.jsx` L384-389 (only `<ReferenceLine y={0}>` exists)

The chart displays NO reference lines for:
- Account baseline (e.g., 100,000)
- Loss floor / blowout level (e.g., 90,000)
- Phase 1 target (e.g., 110,000)
- Phase 2 target (e.g., 105,000)

These values are computed in RunDetail (`fundingLossFloor`, `fundingPhase1Target`, `fundingPhase2Target` at L452-454) and shown as text below the chart filters, but are **never passed to EquityCurveV2** and EquityCurveV2 has no prop for them. The `y={0}` reference line is also not meaningful in dollar-valued mode.

### Bug 4 — Tooltip formats dollar values as R (Major)

**Location:** `EquityCurve.jsx` L180-186 (`TradeTooltip`)

```js
<span>Cumul. R</span>  →  {fmtR(p.netR)}    // e.g. "+100234.50R"
<span>Drawdown</span>  →  {fmtR(ddN)}        // e.g. "-2500.00R"
```

`fmtR()` prefixes with "+" and appends "R". In FTMO mode `netR` is a dollar amount (100,234.50) and `drawdown` is a dollar drawdown (-2,500). Both render as nonsensical R strings.

### Bug 5 — Phase simulation runs on chart-filtered trades (Correctness)

**Location:** `RunDetail.jsx` L591-593 (inside `equityChartData` useMemo)

```js
return buildFundingChallengeEquityCurve(filteredTradesForEquity, accountSettings, fundingSettings);
```

`filteredTradesForEquity` is the equity-chart-filter subset (session / direction / structure / exclude-news / exclude-missed). If the user has any chart filter active, the phase boundary simulation changes — trade numbers shift, phase pass points move. The "Phase 1 passes at Trade 23" number in FundingPhaseCards (which uses `validTradesForRun`) will disagree with the "Phase 1 Pass" marker in the chart (which used the filtered subset). The phase boundary cards and the chart markers are out of sync whenever filters are active.

### Bug 6 — Each phase resets equity to startingBalance (Design / Visual Discontinuity)

**Location:** `fundingChallenge.js` L133-134, L167-168

`buildPhasePoints` calls `buildAccountEquityCurve(phaseTrades, account)` which always initialises `equity = cfg.startingBalance`. This means:
- Phase 1 curve: 100,000 → 110,000 (correct)
- Phase 2 curve: 100,000 → 105,000 (resets — should continue from 110,000)
- Funded curve: 100,000 → ... (resets again)

The UI text acknowledges this ("Phase 2 starts from fresh starting balance after Phase 1 pass") but the result is a serrated equity line with hard jumps at every phase boundary. The `withPhaseStart` anchor point uses `points[0].equityBefore` which is also `startingBalance`, so even the visual anchor at the phase transition jumps back to 100,000.

This is a deliberate architectural choice but produces a misleading chart: the total funded gains appear small even if the strategy outperformed across the board.

### Bug 7 — Phase start anchors abuse `news_action` field (Minor / Data Model)

**Location:** `fundingChallenge.js` L206-210 (`withPhaseStart`)

```js
news_action: phase === "Verification" ? "Verification Start" : phase === "Funded" ? "Funded Start" : "",
```

The `news_action` field is shared between actual news events and phase boundary markers. When `showNews` is true, the `dotFill()` function would reach the `showNews && newsAction` branch for these points — except it's short-circuited because `fundingMarker` is checked first. However, the `TradeTooltip` still renders the news section (lines 189-195) for these anchors, showing "⚡ Verification Start" with the warning colour, which is incorrect.

The `fundingMarker` field already carries the type information (`"phase_2_start"`, `"funded_start"`). The `news_action` field should not be populated for phase anchors.

### Bug 8 — Phase 1 pass marker dot is not visually distinct from standard win dot (UX)

**Location:** `EquityCurve.jsx` L93-103 (`dotFill`)

```js
if (fundingMarker === "funded_start") return "hsl(330 88% 68%)";  // pink
if (fundingPhase === "Funded")        return "hsl(var(--accent-primary))";  // same as win
if (fundingMarker)                    return "hsl(var(--warning))";  // yellow for others
```

`phase_1_pass` and `phase_2_pass` boundary dots use `--warning` (yellow), but so do all other `fundingMarker` variants and all news-affected dots. The Phase 1 Pass and Phase 2 Pass events are the most important milestones in the chart but are only distinguishable by tooltip hover, not visually.

### Bug 9 — No vertical phase boundary lines on chart (Missing, vs. specification)

**Location:** `EquityCurve.jsx` (no `<ReferenceLine>` for vertical/x-axis boundaries)

The spec requires clear visual markers for Phase 1 Pass, Verification Start, Phase 2 Pass, and Funded Start. Currently only coloured dots at those trade indices exist. No vertical lines, no phase-region background shading, no phase labels on the chart.

---

## 4. Answers to Audit Questions

**Should top summary cards change when FTMO overlay is enabled?**
Currently they do not — `netMetricValue`, `maxDdMetricValue`, etc. all use `accountSummary` derived from the full `validTradesForRun` set regardless of overlay state. The correct answer depends on product intent, but the current state provides no funded-period metrics at all. Recommended: add a second metric group ("Live / Funded" section) that is only visible when `useFundingPhaseChart && fundingChallenge.status === "funded"`, showing Net PnL from `fundedStartIndex` onward. Do not replace the existing cards — show both.

**Should chart filters affect FTMO phase calculations?**
No. Phase progression is a sequential property of the full trade series. Chart filters are a research/analysis lens and should not change which trade number constitutes Phase 1 Pass. The phase simulation should always run on `validTradesForRun`. The chart then independently applies `filteredTradesForEquity` to render the visual curve, with phase boundary markers projected onto filtered indices (which may shift slightly but are cosmetic).

**Should Net PnL from live start use trades after funded start even if chart filters are active?**
Yes — the "funded live PnL" KPI should be computed from `validTradesForRun.slice(fundingChallenge.fundedStart.tradeIndex)`, ignoring chart filters. Filters affect chart visuals only.

**Should drawdown in the overlay be shown against the whole challenge, funded-only, or both?**
The funded-only drawdown is the most actionable metric (how much you're down from peak during live trading). Show funded drawdown as the primary metric; add a "Challenge total drawdown" as a secondary detail line in the FundingPhaseCards section. The drawdown strip in the chart should reflect whichever phase the cursor is in.

**Should the y-axis include the hard failure line, account baseline, and phase targets?**
Yes — all three tiers of horizontal reference lines are required:
- Account baseline (100,000) — dashed, muted colour
- Loss floor (90,000) — solid red, labeled "Blowout Floor"
- Phase 1 target (110,000) — dashed, success colour, labeled "P1 Target"
- Phase 2 target (105,000) — dashed, secondary colour, labeled "P2 Target"

**How should the UI behave if the strategy never passes Phase 1?**
`fundingChallenge.phase1.status` will be `"in_progress"` or `"failed"`. The chart should show only the Challenge phase segment with the loss floor and phase 1 target as reference lines. Phase 2 and Funded sections are empty; FundingPhaseCards should show "Not Started" for Phase 2 and Funded. The chart should still render the equity path with the loss floor reference, making the failure visible.

**How should it behave if equity passes a target, falls back, then later passes again?**
Current `evaluatePhase` stops at the **first** trade where `equityAfter >= targetEquity`. If equity dips below the target afterward it doesn't matter — the phase is already passed. This is correct FTMO semantics. The only issue would be if the drawdown after the pass drops to the loss floor, which would trigger a fail in the current code only if it happens during phase 2 (because `evaluatePhase` for phase 2 checks loss floor first). In practice, phase 1 pass is final once recorded.

**Are pass markers tied to trade number, date, or equity point index?**
Trade index within the chronologically-sorted series (`tradeIndex` on the phase result, `tradeNumber = tradeIndex + 1`). The x-axis in the chart uses sequential integer `i` (re-assigned by `buildFundingChallengeEquityCurve` to 0...n). Boundary markers are matched via `point.sourceTradeIndex === boundary.tradeIndex` in `markerForPoint`.

**Are there data model issues where phase pass info exists only in UI state?**
Phase pass info is computed in the `fundingChallenge` useMemo (RunDetail L446-449) via `simulateFundingChallenge`. It is not persisted to the store or the run bundle. This is fine for the overlay's purpose but means the data is ephemeral — recomputed on every render. It is correctly derived from the stable `validTradesForRun` + `accountSettings` + `fundingSettings` inputs.

---

## 5. Recommended Minimal Implementation Plan

### Fix 1 — Y-domain: remove forced 0 in account/dollar mode

**File:** `EquityCurve.jsx`  
**Location:** `yDomain` useMemo, L242-253  
**Change:** Add an `accountMode` boolean prop to `EquityCurveV2`. When true, calculate domain from actual data range without forcing 0:

```js
// accountMode=false (current): domainMin = Math.min(minVal, 0) - pad
// accountMode=true (new):       domainMin = minVal - pad
const domainMin = accountMode ? minVal - pad : Math.min(minVal, 0) - pad;
```

This is a two-line change. The `accountMode` prop also gates Y-axis label formatting (Fix 2).

### Fix 2 — Y-axis labels: currency vs R

**File:** `EquityCurve.jsx`  
**Location:** `YAxis tickFormatter`, L370-376  
**Change:** When `accountMode=true`, format as compact currency:

```js
tickFormatter={(v) => {
  if (accountMode) {
    const n = Number(v);
    return Number.isFinite(n) ? (n >= 1000 ? `${(n/1000).toFixed(0)}k` : String(n)) : "";
  }
  return `${Number.isInteger(n) ? n : n.toFixed(1)}R`;
}}
```

Pass `accountMode={accountModeEnabled}` from RunDetail when constructing `<EquityCurveV2>`.

### Fix 3 — Reference lines: pass level props to EquityCurveV2

**File:** `EquityCurve.jsx` and `RunDetail.jsx`  
**Location:** `EquityCurveV2` component signature; RunDetail L1422-1429  
**Change:** Add an optional `referenceLevels` prop:

```js
export function EquityCurveV2({
  data = [],
  height = 360,
  showDots, showDrawdown, showNews,
  accountMode = false,
  referenceLevels = [],  // [{ y, label, color, dash }]
})
```

Inside the component, render each level as a `<ReferenceLine>` above the equity area in the `ComposedChart`. In RunDetail, pass when `useFundingPhaseChart`:

```js
referenceLevels={useFundingPhaseChart ? [
  { y: fundingLossFloor,    label: "Blowout Floor", color: "hsl(var(--bear))",             dash: "4 2" },
  { y: accountSettings.startingBalance, label: "Baseline", color: "hsl(var(--muted))",     dash: "2 4" },
  { y: fundingPhase1Target, label: "P1 Target",    color: "hsl(var(--success))",            dash: "4 2" },
  { y: fundingPhase2Target, label: "P2 Target",    color: "hsl(var(--accent-secondary))",   dash: "4 2" },
] : []}
```

The existing `<ReferenceLine y={0}>` should be suppressed when `accountMode=true` (it's neither meaningful nor visible after Fix 1 shifts the domain).

### Fix 4 — Tooltip: respect dollar mode

**File:** `EquityCurve.jsx`  
**Location:** `TradeTooltip` component, L145-212  
**Change:** Pass `accountMode` into the tooltip. Replace `fmtR(p.netR)` and `fmtR(ddN)` conditionally:

```js
// netR label: "Balance" when accountMode, "Cumul. R" otherwise
// drawdown label: "$DD" or "R DD" accordingly
// fmtR → formatAccountValue(p.netR, currency) when accountMode
```

The simplest approach is to pass `{ accountMode, currency }` as extra payload fields on each data point in RunDetail (they're already available). The tooltip reads them off `payload[0].payload`.

### Fix 5 — Phase simulation: always use unfiltered valid trades

**File:** `RunDetail.jsx`  
**Location:** `equityChartData` useMemo, L591-593  
**Change:** Separate phase boundary simulation from chart data generation. The funding challenge simulation used by both FundingPhaseCards and chart boundaries should always reference `validTradesForRun`. The chart data build for the equity *line* can still use `filteredTradesForEquity`.

Concretely:
1. Keep the existing `fundingChallenge` useMemo (L446-449) as the source of truth for phase boundaries — it already uses `validTradesForRun`.
2. In `equityChartData`, call `buildFundingChallengeEquityCurve(validTradesForRun, ...)` (not `filteredTradesForEquity`) to get correctly-positioned boundary markers.
3. If the user wants filtered equity, show the standard (non-phase) account equity chart instead, or accept that filtering changes the visual curve but not the boundary markers.

This is a one-line change in RunDetail (`filteredTradesForEquity` → `validTradesForRun` for the `useFundingPhaseChart` branch).

### Fix 6 — Clean up phase start anchor's `news_action` field

**File:** `fundingChallenge.js`  
**Location:** `withPhaseStart`, L206-210  
**Change:** Remove the `news_action` field from phase start anchor points. The `fundingMarker` and `fundingPhase` fields already carry all the information `dotFill` needs. The tooltip should render phase boundary info from `fundingMarker`, not from `news_action`.

```js
// Remove:
news_action: phase === "Verification" ? "Verification Start" : phase === "Funded" ? "Funded Start" : "",
// Keep fundingMarker as the canonical marker field.
```

Simultaneously update `TradeTooltip` to show a phase marker section (using `fundingMarker`) separate from the news section.

### Fix 7 — Funded-period Net PnL metric card

**File:** `RunDetail.jsx`  
**Location:** Near L455 (netMetricValue derivation)  
**Change:** When `useFundingPhaseChart && fundingChallenge.status === "funded"`, compute a separate `fundedPnlSummary`:

```js
const fundedTradesSlice = fundingChallenge.fundedStart?.tradeIndex != null
  ? validTradesForRun.slice(fundingChallenge.fundedStart.tradeIndex)
  : [];
const fundedPnlSummary = fundedTradesSlice.length
  ? summarizeAccountEquity(fundedTradesSlice, accountSettings)
  : null;
```

Render this as an additional row below the existing KPI strip — a narrow "FUNDED / LIVE METRICS" bar with Net PnL (funded), trade count (funded), and win rate (funded). This does not replace the existing cards; it supplements them.

---

## 6. UX Improvements Worth Considering

**A. Phase region background shading**
Use Recharts `<ReferenceArea>` to shade the challenge / verification / funded phase segments with distinct background tints (very low opacity). This makes phase boundaries instantly readable without needing a legend.

**B. Vertical phase boundary lines with labels**
Add `<ReferenceLine x={boundaryIndex} label="P1 Pass">` at each phase transition. Currently only coloured dots mark these events.

**C. Separate drawdown metric per phase**
The drawdown strip shows drawdown from peak within each phase. A small text badge showing "Max DD in challenge: $X" / "Max DD in funded: $Y" next to the FundingPhaseCards would be very useful.

**D. "Challenge Journey" label band**
A non-interactive banner above the chart showing three labelled zones ("Challenge", "Verification", "Funded / Live") aligned to the x-axis would make the narrative immediately obvious without needing tooltips.

**E. Handling the equity reset visual jump**
The current per-phase equity reset creates a jarring visual discontinuity. Two options:
1. Keep per-phase reset but draw a horizontal continuation line (ghost line) showing "where you came from."
2. Add a "Continuous mode" toggle that builds the equity curve without phase resets — as one uninterrupted balance path with phase boundaries marked as vertical lines. The "Continuous Account Equity" chart mode already exists for this (RunDetail L1379-1384) and partially addresses this.

**F. Summary pill in the chart panel header**
Replace the static `<Pill tone="primary">ACCOUNT BALANCE</Pill>` with a dynamic pill that shows the current status: "FTMO — IN PROGRESS", "FTMO — FUNDED ✓", "FTMO — FAILED ✗" when the overlay is active.

---

## 7. Risks and Edge Cases

**E1 — No trades pass Phase 1**
`fundingChallenge.phase1.status` is `"in_progress"` or `"failed"`. `phase2Points` and `fundedPoints` are empty arrays. `buildFundingChallengeEquityCurve` returns only phase1 points. Chart renders only the challenge segment. FundingPhaseCards show "Not Started" for Phase 2 and Funded. No crash risk. The loss floor reference line is especially important in this state.

**E2 — Equity passes target, drops to floor, passes target again**
`evaluatePhase` stops on the first breach of either condition (fail before pass if fail comes first; pass if pass comes first). A pass is final — a later drawdown to the floor within the same phase would not be caught because the loop already exited. This is correct FTMO semantics for Phase 1 but could be misleading in edge-case data.

**E3 — Filters reduce trades to zero**
`filteredTradesForEquity.length === 0` → `equityChartData = []` → `EquityCurveV2` shows "No data available" fallback. If Fix 5 is implemented (use `validTradesForRun` for the funding path), this path would only be hit in the continuous equity mode.

**E4 — `startingBalance` is 0 or very small**
`lossFloor = startingBalance * (1 - maxOverallLossPct/100)` = 0. All trades immediately appear to fail. `normalizeAccountSettings` enforces `positiveNumber(settings.startingBalance, 10000)` so a null/undefined starting balance defaults to 10,000 rather than 0. But a user-entered value of 0 or 1 would produce nonsensical targets. The UI does not prevent this.

**E5 — R-only mode with FTMO overlay toggled on**
`accountModeEnabled = false` → `useFundingPhaseChart = false` regardless of `fundingSettings.enabled`. The overlay panel shows "Enable Account view to simulate funding targets." The KPI strip and chart remain in R mode. No crash risk. This is correctly gated.

**E6 — Account mode `current_equity_pct` with FTMO overlay**
Phase equity curves will compound differently within each phase (risk scales to current equity). The `lossFloor` is still computed from `startingBalance`, but the equity path compounding inside `buildAccountEquityCurve` uses the current-equity-pct model. This is technically correct but the phase resets compound the visual confusion — each phase resets equity to `startingBalance` and then re-compounds from there.

**E7 — Phase boundary marker index mismatch after chart filtering**
If Fix 5 is NOT implemented, the `fundingChallenge` simulation (FundingPhaseCards) uses `validTradesForRun` but `buildFundingChallengeEquityCurve` uses `filteredTradesForEquity`. The FundingPhaseCard says "Phase 1 passes at Trade 23" but the chart marker appears at a different trade index. This is a silent inconsistency that's currently always present whenever any chart filter is active.

**E8 — `minTradingDays` requirement not enforced in equity curve builder**
`minTradingDaysMet` is tracked in `evaluatePhase` but does not block `status === "passed"`. The phase is marked passed purely on equity threshold, and `minTradingDaysMet` is only shown as a flag in the FundingPhaseCard. A phase could show "Passed" in the chart even if the minimum trading days were not met. This is noted but not a blocker for the visual fixes.

---

## 8. Summary

The two critical bugs are:

1. **`Math.min(minVal, 0)` in `yDomain`** — the chart is visually broken in dollar mode, forcing the equity line into the top few percent of the canvas.
2. **No reference lines passed to `EquityCurveV2`** — the blowout floor and target levels are computed and shown as text but never appear on the chart itself.

The three important correctness bugs are:

3. **Phase simulation runs on filtered trades** — phase markers disagree with FundingPhaseCards when chart filters are active.
4. **Tooltip formats dollar amounts as R** — `fmtR(netR)` when `netR` is ~100,000.
5. **`news_action` field abused for phase anchors** — "Verification Start" renders in the news tooltip section.

The minimum viable fix set is: Fix 1 + Fix 2 + Fix 3 + Fix 4 + Fix 5 + Fix 6 (six changes, three files: `EquityCurve.jsx`, `fundingChallenge.js`, `RunDetail.jsx`). Fix 7 (funded-period PnL card) is a feature addition and can follow separately.

No architectural changes are required. No new dependencies. All changes are additive props or small conditional branches.
