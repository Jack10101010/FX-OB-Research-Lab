# RW-1 — Run Workspace Result View / Scenario-Aware Design Audit

**Mode: AUDIT ONLY — no files modified**

---

## 1. Current Architecture — Plain English

### What is a run?

A run is a backtesting bundle produced by the FX-OB-Backtester Python engine and imported into the app. It lives in `state.runs[runId]` (in-memory) and is the top-level container for everything a single backtest produced.

A bundle contains:
- `trades` — flat primary trade list (baseline)
- `tradesByVariant` — same trades re-organised by position-management variant (`single_position`, `allow_multi_position`, `one_per_direction`)
- `entryResults.tradesByMode` — entry-model scenario trades, keyed by `entry_triggered_edge_25p0_next`, `entry_penetration_10p0`, etc.
- `orderBlocks` — detected OB lifecycle data
- `config` — the backtester parameter settings
- `summary` — pre-computed roll-up stats (trade count, net R, etc.)

### What is a baseline/reference?

The baseline is the raw trade list produced when the backtester ran with no entry-model filter applied. It represents the strategy at its most permissive: "execute every OB fill regardless of how price reached the entry zone."

In data terms the baseline is resolved as:
```
entryResults.tradesByMode.entry_baseline
  || entryResults.tradesByMode.baseline
  || tradesByVariant[selectedVariant]
  || trades
```

The **position variant** (single / multi / one-per-direction) is a sub-dimension of the baseline: it controls which trades survive a conflict filter, but it is still the baseline entry model.

### What is a scenario?

A scenario is an alternative trade list produced by re-running the entry trigger logic with a specific model. The supported scenario families currently are:

- **triggered_edge** — "only take the fill if price has moved at least N% into the OB before triggering." Stored as `entry_triggered_edge_25p0_same` or `entry_triggered_edge_25p0_next` depending on whether the fill happens on the same candle as the trigger or the next.
- **penetration** — "only take the fill if price has penetrated N% through the OB." Stored as `entry_penetration_10p0`.

Each scenario produces a **subset** of the baseline trades: same OBs, but only the ones where the entry condition was met. Trade R values are typically the same (since the OB's SL/TP geometry is unchanged), but the trade count changes.

Scenarios live in `runData.entryResults.tradesByMode`. A single run can have multiple scenarios (different thresholds, fill modes).

### What does "scenario-aware" mean?

A page is scenario-aware when it reads `universe.trades` from `useTradeUniverse()` rather than reading `runData.trades` directly. `useTradeUniverse()` resolves against `state.scenario` — the global object `{ runId, family, threshold, fillMode, positionVariant }` — and returns the correct trade list, label, warnings, and baseline reference for comparison.

Pages currently scenario-aware: StrategyMap, FailuresWorkspace, HypothesisLab, TradeInspector, NewsLab, OrderBlockLab, Overview (with baseline override), ProtectionLab, ComparisonLab.

### Why Run Workspace currently says "Scenario-aware: No"

Because `RunDetail.jsx` derives its trade list like this:

```js
const tradesForRun =
    (selectedRunVariant && runData?.tradesByVariant?.[selectedRunVariant])
    || runData?.trades
    || (isActiveRun ? TRADES : null);
```

This resolves a **position variant** (multi/single/one-per-dir) but ignores `runData.entryResults.tradesByMode` entirely. It does not call `useTradeUniverse()`. The chip is technically accurate: the KPI strip, equity curve, and all analytics sections read the baseline position-variant trades, not the selected entry-model scenario.

The comment at line 522–526 in RunDetail confirms this was intentional at the time of writing:

> "RunDetail today is NOT entry-scenario-aware: it shows the selected position-variant baseline (single / multi / one-per-direction). Strategy Map and Entries Lab are the surfaces that drill into entry-model scenarios."

This was a reasonable short-term decision but it creates a real UX problem: the user tests a "Triggered Edge 25% Next" scenario in Strategy Map, sees promising KPIs there, then goes to Run Workspace to analyse the full equity curve — and sees different (worse) numbers with no explanation other than a chip that says "Scenario-aware: No."

---

## 2. Run Workspace Data Source Map

For every analytics section, what does it actually read?

| Section | Source | Notes |
|---|---|---|
| **KPI strip** (Net R, Win Rate, Trades, Expectancy, PF, Max DD) | `validTradesForRun` = `tradesForRun.filter(isPerformanceTrade)` | `tradesForRun` is position-variant baseline |
| **Equity curve** | `filteredTradesForEquity` ← `validTradesForRun` filtered by session/direction/structure toggles. Account equity path: `buildAccountEquityCurve(filteredTradesForEquity, accountSettings)` | Chart filters affect the equity path but NOT the KPI strip |
| **Account simulation** (summarize + funding challenge) | `validTradesForRun` → `summarizeAccountEquity()` and `simulateFundingChallenge()` | Full valid set; chart filters do NOT affect these figures |
| **Monthly performance (MONTHLY)** | `tradesForRun` (ALL rows, including non-performance) | Inconsistency: monthly sums R from ALL rows, but KPI strip uses only `isPerformanceTrade` rows |
| **R distribution (R_DIST_V2)** | `tradesForRun.filter(isValidExecutedTrade)` | Same gate as KPI |
| **Session split (SessionSplit)** | `tradesForRun` passed as prop | Component handles its own filtering |
| **Trade ledger** | `filteredLedgerRows` ← `tradesForRun` + ledger filter toggles | Shows all rows by default, filtered by result/session/direction/search |
| **OB stats** | `runData?.orderBlocks` + `runData?.trades` (hardcoded, NOT `tradesForRun`) | Lifecycle counts and directional stats always use the raw bundle arrays |
| **Research strip / What Changed (deltaRows)** | `summarizeRunForDelta(run, runData?.trades)` — hardcoded to bundle.trades | Delta comparison always uses raw bundle; never the selected scenario |
| **Directional outcome stats** | `validTradesForRun` | Same universe as KPI |
| **Auto insights** | Derived from `outcomeSummary`, `R_DIST_V2`, `directionalOutcomeStats` | All trace back to `validTradesForRun` |
| **Configuration panel** | `runData.config`, `run.*` fields | Static metadata; no trades involved |
| **Funding challenge phase cards** | `validTradesForRun` via `simulateFundingChallenge()` | Same universe as account simulation |

**Key findings:**
- Six out of seven analytics sections trace back to `tradesForRun`, which is derived via one variable. Swapping the variable swaps them all at once.
- OB stats and Research Strip are hard-wired to `runData.trades` and `runData.orderBlocks`. These two would NOT change when the Result View is switched — which is the correct behaviour. OB lifecycle is a property of the OBs themselves, not of which entry model fired.
- The monthly performance section reads ALL rows (not just performance trades), which is a pre-existing inconsistency unrelated to this work.

---

## 3. Feasibility of Making Run Workspace Scenario-Aware

### Can `useTradeUniverse(runId)` safely provide the selected scenario trades?

**Yes, with one critical caveat about the scenario override.**

`getTradeUniverse(runId, scenarioOverride)` in `store.js` does:
```js
const effectiveRunId = runId || state.activeRunId || null;
const bundle = effectiveRunId ? state.runs[effectiveRunId] || null : null;
const scenario = scenarioOverride || state.scenario || null;
```

If `scenarioOverride` is null (not passed), it reads `state.scenario` — the GLOBAL scenario last set by Strategy Map. That global scenario has its own `.runId`. If the user opened RunDetail for Run B while Strategy Map was last used on Run A, `state.scenario.runId` = Run A but `effectiveRunId` = Run B. The resolver picks the Run B bundle correctly (the `effectiveRunId` controls which bundle is fetched), but the scenario's family/threshold/fillMode are from Run A. Run B might not even have that scenario. This produces either an empty trade list (NO_TRADES_FOR_SCENARIO warning) or silently falls back to baseline.

The safe pattern is:
```js
useTradeUniverse(runId, localResultView)
```
where `localResultView` is RunDetail's own local state, not the global scenario.

### What happens if the selected scenario does not exist for that run?

`resolveTradeUniverse` returns `trades: []` and pushes a `NO_TRADES_FOR_SCENARIO` warning:
```
"No trades found for 'entry_triggered_edge_25p0_next' on variant 'allow_multi_position'."
```

The Result View UI should detect `universe.trades.length === 0` on a non-baseline selection and render a "Scenario unavailable for this run" warning rather than showing empty KPIs. It should also auto-fallback to baseline so the user is never left with a blank page.

### What happens with "Both" fill mode?

When `state.scenario.fillMode = null` (the UI default meaning "both"), but the run only exported separate `_same` and `_next` CSVs (no bare combined CSV), the resolver:
1. Emits `BOTH_UNAVAILABLE_NO_COMBINED` warning
2. Coerces fillMode to `"next"` (then `"same"` if next is absent)

This coercion is safe but surprising. The Result View selector **must never show a "Both" option** unless `hasCombinedByFamilyThreshold` is true for that family/threshold pair. The available options should be discovered from `buildAvailableOptions(collectAllEntryKeys(bundle, baseTrades))`.

### Does account equity work on universe.trades?

Yes. `buildAccountEquityCurve(trades, accountSettings)` and `summarizeAccountEquity(trades, accountSettings)` accept any trade array. There is one meaningful consequence: **account equity is sequence-dependent**. Scenario trades are a subset of baseline trades, preserving the original trade order (the same OBs in the same chronological sequence, minus the ones that didn't trigger). So equity ordering is correct. Drawdown and compounding figures will differ between baseline and scenario — this is correct and expected.

### Can equity/monthly/R distribution be derived from universe.trades?

Yes. All three analytics sections are pure functions of a trade array:
- Equity: `buildAccountEquityCurve(trades, accountSettings)`
- Monthly: group by `entry` date month key, sum R
- R distribution: bucket `isPerformanceTrade` rows by R value

The `tradesForRun` variable is the single funnel for all three. Switching it to `universe.trades` changes all three simultaneously with no further edits.

---

## 4. Recommended Product Design

### Replace "Scenario-aware: No" with a "Result View" selector

The current scope chip row is an information display (read-only pills). It should be upgraded to an **interactive selector** that lets the user pick which result universe drives this page.

**Result View options (discovered dynamically from the bundle):**

```
● Baseline Reference              ← always present
○ Triggered Edge 25% · Next       ← if entry_triggered_edge_25p0_next exists
○ Triggered Edge 25% · Same       ← if entry_triggered_edge_25p0_same exists
○ Penetration 10%                 ← if entry_penetration_10p0 exists
```

**The selector chip row should show:**

| Field | Content |
|---|---|
| **Result View** | Currently selected view label ("Baseline Reference" or "Triggered Edge 25% · Next") |
| **Universe type** | "Baseline" (muted) or "Scenario" (success green) |
| **Source** | Best-effort CSV filename (`trades_allow_multi_position__entry_triggered_edge_25p0_next.csv`) |
| **Trades** | Count of performance trades in the selected universe |
| **Warnings** | FILL_MODE_COERCED (violet) or BOTH_UNAVAILABLE_NO_COMBINED (amber) from universe.warnings |

When a non-baseline view is selected and `universe.trades.length === 0`, add a prominent:
```
⚠ Scenario not available for this run — showing baseline reference.
```
and auto-fallback the displayed data to baseline.

When entry scenarios exist but baseline is selected:
```
Entry scenarios available — select a Result View above to compare.
```
(This replaces the current link to Strategy Map.)

---

## 5. Global vs. Local State — Recommendation

### Options reviewed

**A. Use global `state.scenario`**
Pros: trivial to implement (just call `useTradeUniverse(runId)`).
Cons: stale global scenario from Strategy Map's last selection causes wrong data with no warning. User opens RunDetail for a different run and sees a scenario they never chose for that run. Dangerous.

**B. Use local Run Workspace state (✓ Recommended)**
RunDetail maintains its own `resultView` state:
```js
const [resultView, setResultView] = useState(() => {
    // Bootstrap from global state only if it applies to this run
    const gs = /* state.scenario */;
    if (gs?.runId === runId && gs?.family && gs.family !== "baseline") {
        return { family: gs.family, threshold: gs.threshold, fillMode: gs.fillMode };
    }
    return { family: "baseline", threshold: null, fillMode: null };
});
```
Then: `const universe = useTradeUniverse(runId, resultView);`

Pros: isolated from stale global state. Run-specific. Safe.
Cons: local state resets on navigation (back to baseline). Not synced to Strategy Map.

**C. Use global scenario but pin/sync runId**
Validate `state.scenario.runId === runId` before using it; reset to baseline otherwise.
Pros: keeps Strategy Map and Run Workspace in sync when the user navigates between them.
Cons: shared mutable state — opening Strategy Map on Run A while viewing Run B in another tab changes Run B's Result View. Complex validation logic.

**D. Hybrid**
Local state with "sync from Strategy Map" button. Too complex for the value.

### Recommendation: Option B

Use local state. The run switcher dropdown already handles cross-run navigation. When the user switches runs via the dropdown, reset `resultView` to baseline (via a `useEffect` keyed on `runId`). The only downside (local state resets on navigation) is acceptable: baseline is always a safe default, and the user can quickly re-select their scenario.

**Persistence**: Do NOT persist `resultView` to localStorage in RW-2. It adds stale-state risk (persisted scenario that no longer exists for the current run) without much UX gain. Revisit in a later phase if users repeatedly complain about losing their selection.

---

## 6. Implementation Phases

### Phase RW-2 — Add Result View selector (UI only, no analytics change)

Goal: replace the broken "Scenario-aware: No" chip with a functional selector. No numbers change.

Steps:
1. Add `const [resultView, setResultView] = useState(…)` local state to RunDetail. Default: `{ family: "baseline" }`.
2. Add `useEffect([runId])` to reset `resultView` to baseline on run change.
3. Call `const universe = useTradeUniverse(runId, resultView)` to get the resolved universe object (label, warnings, available options, trades).
4. Derive available options: `const options = buildAvailableOptions(collectAllEntryKeys(runData, runData?.trades))`. This is a pure call — no hook needed.
5. Replace the current scope chip row with a `ResultViewSelector` sub-component:
   - Shows "Baseline Reference" pill always.
   - Shows one pill per available scenario key (discovered from `entryResults`).
   - Shows active selection, source file, warning chips.
   - Calls `setResultView(...)` on click.
6. Do NOT yet wire `universe.trades` to `tradesForRun`. The selector is read-only UI.
7. Update `scopeChip.scenarioLabel` to reflect the selected universe label instead of the hardcoded string. Remove the "Scenario-aware: No" row.

Deliverable: user can see and change the Result View. Numbers on the page still come from the old `tradesForRun` path (unchanged).

---

### Phase RW-3 — Wire KPI/equity/monthly/R-dist/ledger to universe.trades

Goal: the selected Result View drives all analytics sections.

Steps:
1. Replace `tradesForRun` derivation:
```js
// Before (Phase RW-2 and earlier):
const tradesForRun =
    (selectedRunVariant && runData?.tradesByVariant?.[selectedRunVariant])
    || runData?.trades
    || (isActiveRun ? TRADES : null);

// After (Phase RW-3):
const tradesForRun = universe.trades.length > 0
    ? universe.trades
    : /* fallback to old path if universe is empty and baseline was intended */
      (selectedRunVariant && runData?.tradesByVariant?.[selectedRunVariant])
      || runData?.trades
      || (isActiveRun ? TRADES : null);
```
Actually cleaner: make `universe` always resolve (even baseline) and just use `universe.trades` directly. `resolveBaselineUniverse()` already handles the fallback chain. On baseline selection, `universe.trades` equals the old `tradesForRun`. Verify parity with a count check in a debug log.

2. All downstream memos (`validTradesForRun`, `MONTHLY`, `R_DIST_V2`, `outcomeSummary`, `directionalOutcomeStats`, `filteredTradesForEquity`, `filteredLedgerRows`) automatically update because they all depend on `tradesForRun`.

3. Add a "scenario result view active" banner above the KPI strip when `universe.universeType === "scenario"`:
```
Viewing: Triggered Edge 25% · Next  |  35 trades  |  vs. Baseline 78 trades
```

4. OB stats and Research Strip: leave unchanged. They use `runData?.orderBlocks` and `runData?.trades` intentionally.

5. Verify baseline parity: add a dev-only assertion that when `resultView.family === "baseline"`, `universe.trades.length === (old tradesForRun).length`.

---

### Phase RW-4 — Account simulation and funding challenge

Goal: account equity, funding phase cards, and funded-period strip all read the scenario trades.

Steps:
1. `accountSummary`, `fundingChallenge`, `fundedTrades`, `fundedStats`, `fundedSummary` all take `validTradesForRun` as input. After RW-3, `validTradesForRun` is already derived from `universe.trades`, so these automatically update.
2. Add a warning in the account simulation panel when a non-baseline result view is selected:
```
⚠ Account equity is sequence-dependent. Scenario results use a subset of baseline trades in their original chronological order.
```
3. Funding phase boundary trade numbers shift when scenario trades change. No special handling needed — `simulateFundingChallenge` is purely index-based.

---

### Phase RW-5 — Research Strip and findings metadata

Goal: the "What Changed" delta and findings context acknowledge the active result view.

Steps:
1. `deltaRows` currently calls `summarizeRunForDelta(run, runData?.trades)`. Update to pass `universe.trades` as the second argument when `universe.universeType === "scenario"`, with a note in the delta header showing which result view is active.
2. Pass `resultView` / universe label through to `ResearchStrip` as a `resultViewLabel` prop. The strip can show "Analysing: Triggered Edge 25% · Next" in its context header.
3. When tagging findings (if/when that feature exists), include the universe sourceKey in the finding metadata so findings are scoped to the correct result view.

---

## 7. Risks

### 1. Breaking baseline parity (High priority)

Risk: switching `tradesForRun` to `universe.trades` on the baseline path changes KPI numbers.

Analysis: The baseline path in `resolveTradeUniverse` resolves to:
```
byMode.entry_baseline || byMode.baseline || tradesByVariant[variant] || bundle.trades
```
The old `tradesForRun` path resolves to:
```
tradesByVariant[selectedRunVariant] || bundle.trades || TRADES
```

These should be equivalent for runs that have no `entryResults` (most imported runs). For runs WITH entry results, `byMode.entry_baseline` takes precedence and may differ from `tradesByVariant[variant]` if the entry model run used a different variant.

**Mitigation**: in RW-3, add a baseline parity check that logs a warning when the counts differ. Do not hard-fail.

---

### 2. Account equity mismatch (Medium)

Risk: scenario trades are a subset of baseline trades. Account equity with compounding will produce different numbers not just because there are fewer trades, but because the account equity at each point depends on path.

Analysis: this is **correct and intended** — the scenario equity path IS different. The risk is user confusion: "why is my account equity different from the baseline?"

**Mitigation**: show a banner when a non-baseline result view is active. The banner explains that the scenario is a filtered subset and the equity path reflects only trades that met the entry condition.

---

### 3. Scenario not available for this run (Medium)

Risk: user has `resultView = { family: "triggered_edge", threshold: 25, fillMode: "next" }` stored locally, but loads a different run that doesn't have that scenario. The selector shows the selection, but `universe.trades = []`.

**Mitigation**: 
- When `universe.trades.length === 0 && resultView.family !== "baseline"`: auto-display as baseline (show the warning chip), do not reset the selection (user may want to switch to a run that does have it).
- The available options are discovered per-run, so the selector pills for unavailable scenarios are greyed out or hidden.

---

### 4. Confusing project baseline semantics (Low)

Risk: "Baseline Reference" in the Result View selector is confused with "the project's baseline run" (the first run in a project workflow, used as the comparison anchor in Research Strip).

**Mitigation**: label carefully. The Result View says "Baseline Reference" (referring to the result universe — no entry filter). The Research Strip says "Baseline Run" (referring to the project run role). Different surfaces; different labels.

---

### 5. Comparison with old runs (Low)

Risk: runs imported before `entryResults` was exported will have no scenarios. The Result View selector should not show scenario options for these runs.

**Mitigation**: `buildAvailableOptions(collectAllEntryKeys(bundle, baseTrades))` returns `availableFamilies = []` when no entry results exist. The selector shows only "Baseline Reference" and does not offer a "No entry scenarios" dropdown item.

---

### 6. Persisted user selection (Low)

Risk: if `resultView` is persisted to localStorage, it can be stale on next visit (scenario no longer exists, run has been replaced, threshold changed).

**Mitigation**: Do not persist `resultView` in RW-2 or RW-3. Add localStorage persistence in a later phase behind a version key (`fxob_rw_result_view_v1`) with per-run keying (`runId` as namespace). Validate on load that the scenario key still exists in the bundle before restoring.

---

### 7. "Both" fill mode coercion (Low)

Risk: if the UI offered a "Both" option and the run only has separate `_same`/`_next` CSVs, the resolver silently coerces and the trade count could appear to "jump" as the user explores.

**Mitigation**: never show a "Both" pill in the Result View selector unless `hasCombinedByFamilyThreshold[family::threshold] === true`. The coercion warning chip in `TradeUniverseBadge` provides a second line of defence if a "Both" view is somehow reached.

---

## 8. Summary Outputs

### Current Architecture (plain English)

A run is a bundle. The bundle has a baseline trade list and optionally a set of entry-model scenario trade lists. The global `state.scenario` object tracks which scenario Strategy Map is showing. Run Workspace ignores both `state.scenario` and `entryResults.tradesByMode` — it reads the position-variant baseline trade list directly. The "Scenario-aware: No" chip is technically correct: every section on Run Workspace shows baseline numbers regardless of what the user selected in Strategy Map.

---

### Run Workspace Data Source Map (Summary)

```
tradesForRun  ──→  validTradesForRun  ──→  KPI strip
                                    ──→  Equity curve (filtered by chart toggles)
                                    ──→  Account simulation / funding challenge
                                    ──→  Directional outcome stats
                                    ──→  Auto insights
               ──→  MONTHLY (all rows)
               ──→  R_DIST_V2 (perf-trades only)
               ──→  Session split (all rows)
               ──→  Trade ledger (all rows + ledger filters)

runData.orderBlocks + runData.trades  ──→  OB stats  (always baseline, correct)
runData.trades  ──→  Research Strip / What Changed  (always baseline, needs update in RW-5)
runData.config + run.*  ──→  Configuration panel (static, no change needed)
```

`tradesForRun` is the single variable that feeds six of seven analytics sections. Changing it changes them all.

---

### Recommended Product Model

Replace the read-only "Scenario-aware: No" chip with a `ResultViewSelector` sub-component inside the scope chip row. Options are discovered dynamically from `buildAvailableOptions(collectAllEntryKeys(bundle, baseTrades))` and shown as pills: "Baseline Reference" always first, then scenario options in alphabetical/threshold order.

The selected view drives `universe = useTradeUniverse(runId, resultView)`. `universe.trades` becomes `tradesForRun`.

---

### Recommended State Model

**Local Run Workspace state (Option B).**

```js
const [resultView, setResultView] = useState(() => {
    // Bootstrap from global only if it matches this run
    const gs = SCENARIO; // from useDataset()
    if (gs?.runId === runId && gs?.family && gs.family !== "baseline") {
        return { family: gs.family, threshold: gs.threshold, fillMode: gs.fillMode };
    }
    return { family: "baseline", threshold: null, fillMode: null };
});

// Reset to baseline when run changes
useEffect(() => {
    setResultView({ family: "baseline", threshold: null, fillMode: null });
}, [runId]);

const universe = useTradeUniverse(runId, resultView);
```

Do not write to `setScenario(...)` from RunDetail. The global scenario belongs to Strategy Map. RunDetail uses it for bootstrapping only, then goes its own way.

---

### Implementation Phases (Summary)

| Phase | Goal | Risk |
|---|---|---|
| **RW-2** | Add Result View selector UI, no analytics change | Low — display only |
| **RW-3** | Wire tradesForRun → universe.trades (KPI/equity/monthly/R-dist/ledger) | Medium — verify baseline parity |
| **RW-4** | Account simulation/funding challenge on universe.trades | Medium — document equity path change |
| **RW-5** | Research Strip / What Changed / findings metadata | Low |

---

### Exact Next Implementation Prompt (RW-2)

```
MODE: IMPLEMENT
TASK: RW-2 — Add Result View selector to Run Workspace (UI only, no analytics change)

FILES TO MODIFY:
- frontend/src/pages/RunDetail.jsx

DO NOT MODIFY:
- Any data files (store.js, tradeUniverse.js, useTradeUniverse.js)
- Analytics memos (tradesForRun, validTradesForRun, MONTHLY, R_DIST_V2, etc.)
- OB stats or Research Strip sections

WHAT TO BUILD:
1. Import useTradeUniverse from "@/data/useTradeUniverse" and buildAvailableOptions,
   collectAllEntryKeys from "@/data/tradeUniverse".

2. Add local state:
   const [resultView, setResultView] = useState(() => {
       // Bootstrap from global SCENARIO only if it matches this runId
       if (SCENARIO?.runId === runId && SCENARIO?.family && SCENARIO.family !== "baseline") {
           return { family: SCENARIO.family, threshold: SCENARIO.threshold, fillMode: SCENARIO.fillMode };
       }
       return { family: "baseline", threshold: null, fillMode: null };
   });
   
   // Reset to baseline when run changes
   useEffect(() => {
       setResultView({ family: "baseline", threshold: null, fillMode: null });
   }, [runId]);

3. Call:
   const universe = useTradeUniverse(runId, resultView);

4. Derive available options (pure, no hook):
   const availableOptions = useMemo(
       () => buildAvailableOptions(collectAllEntryKeys(runData, runData?.trades || [])),
       [runData]
   );
   
   Build a flat list of selectable views:
   - { key: "baseline", label: "Baseline Reference", family: "baseline", threshold: null, fillMode: null }
   - One entry per available scenario (family + threshold + fillMode combo)

5. Replace the current scope chip `<ScopeRow label="Scenario-aware"><Pill tone="muted">No</Pill></ScopeRow>` 
   and the `<ScopeRow label="Entry scenarios">` row with a new sub-component ResultViewSelector:
   - Shows pills or a NeonSelect for each available view
   - Highlights the active selection
   - Shows universe.label, universe.sourceFile (truncated), universe.stats.total trades
   - Shows universe.warnings chips (FILL_MODE_COERCED, BOTH_UNAVAILABLE_NO_COMBINED)
   - When universe.universeType === "scenario" and universe.trades.length === 0, shows:
     "⚠ Scenario not available for this run — showing baseline data below."

6. DO NOT change tradesForRun or any analytics memos. The selector is display-only.

7. Remove the text: "Run Detail shows the primary/reference trade universe (baseline). Open 
   Strategy Map to inspect individual entry-model scenarios." 
   Replace with the Result View selector UI if entry scenarios exist.

ACCEPTANCE CRITERIA:
- The scope chip row no longer says "Scenario-aware: No"
- Available scenarios appear as selectable options when entryResults exists on the run
- Selecting a scenario changes the chip label and source file shown
- No KPI numbers change (tradesForRun is unchanged)
- Selecting a scenario shows "Analytics still reflects baseline reference — Phase RW-3 will wire analytics to the selected view." in a muted info line below the selector
- Selecting a different run from the run switcher resets the Result View to Baseline
```
