# Table Compare Drawer / Inline Run Comparison — Audit & Design

**Mode:** AUDIT + DESIGN ONLY. No files modified, no implementation performed.
**Date:** 2026-05-29
**Scope:** A reusable system that lets any eligible analytics table compare its current rows against another run, scenario, or trade universe *inline*, without leaving the page.

> One-line goal: give every breakdown table a corner control — **Compare with: [ Previous Run / Selected Run / Selected Scenario / None ]** — that expands the table downward into a second, row-matched comparison view with deltas.

---

## 0. Executive Summary

The app already has the three pieces this feature needs:

1. A **single table primitive** (`DataTable`) every breakdown table already routes through.
2. A **named, scenario-aware trade resolver** (`useTradeUniverse` / `resolveTradeUniverse`) that can produce a second trade list for any run + scenario + variant combination on demand.
3. A **planned single calculator** (`resultsBasis.js` → `summarizeBuckets`) that the Results Basis roadmap already specifies for turning a trade list + `keyOf` grouping fn into row summaries.

What is missing is the *glue*: a wrapper that (a) builds a comparison trade list from a run/scenario selector, (b) re-runs the same bucket builder over it, (c) matches rows by key, and (d) renders deltas. That glue is `<TableCompareShell>`.

The recommendation is a **delta-column-inside-the-same-table** default, with an **expandable second table** as the power view — *not* side-by-side (too wide for dense tables) and *not* a separate drawer (defeats "inline"). Pilot on **OrderBlockLab → Structure Quality (BOS vs CHoCH)** exactly as proposed in the brief: 2–3 rows, stable string keys, obvious value, near-zero clutter risk.

---

## 1. Files / Pages Inspected

Data & calculation layer:

- `frontend/src/components/lab/DataTable.jsx` — the canonical table primitive (`columns`, `rows`, `rowKey`, `render`, `sortValue`, `heatmap`). Every candidate table renders through this.
- `frontend/src/data/tradeUniverse.js` — `resolveTradeUniverse` → returns `{ universeType, label, trades, stats, baselineTrades, baselineStats, scenario:{family,threshold,fillMode}, variant, warnings, canCompareToBaseline }`.
- `frontend/src/data/useTradeUniverse.js` — React hook `useTradeUniverse(runId, scenarioOverride)`; the supported way to get a *second* trade list for an arbitrary run/scenario.
- `frontend/src/data/store.js` — `getRunData(runId)`, `getTradeUniverse(runId, scenarioOverride)`, `RUNS` / `ACTIVE_RUN` (via `useDataset`), `getProjectRuns`, and `reloadFullRunFromSidecar(runId)` (lazy hydration of index-only runs).
- `frontend/src/lib/metrics.js` — `computeProfitFactor`, `computeMaxDrawdown`, `computeExpectancy`, `computeAvgWinLoss` (the basis used by ComparisonLab today).
- `frontend/src/data/tradeClassification.js` — `summarizeTradeSanity` (canonical raw-R roll-up).

Surfaces with candidate tables:

- `frontend/src/pages/OrderBlockLab.jsx` — `bucketRows()` / `finalizeBucket()` produce every breakdown row; `structureRows`, `directionRows`, `originSessionRows`, OB-quality, news-created, penetration, etc.
- `frontend/src/pages/NewsLab.jsx`, `frontend/src/pages/HypothesisLab.jsx` — inline bucket-row tables.
- `frontend/src/components/lab/entries/model/*` — EntriesLab per-model tables (`DirectionPanel`, `MaeAnalyticsPanel`, `TradeOffPanel`, `TradeDiffExplorer`).
- `frontend/src/pages/ComparisonLab.jsx` — the **existing** page-level multi-run comparison (baseline-only, run-level KPIs/equity). Important prior art; the new feature is the *table-level, inline* complement to it.

Design context already on disk (this design conforms to it):

- `RESULTS_BASIS_IMPLEMENTATION_ROADMAP.md` — specifies `summarizeBuckets(trades, { keyOf, basis, account, bucketMode })`, the LENS bar (Universe + Basis selectors), per-table **scope badges**, and **Contribution vs Isolated** modes.
- `RESULTS_BASIS_SCENARIO_ANALYTICS_AUDIT.md` — documents that bucket math is currently re-implemented inline in ~3 places; consolidation into `resultsBasis.js` is the precondition that makes this feature clean.

---

## 2. Candidate Tables (Q1)

A table is a good candidate when it has **stable, low-cardinality, categorical row keys** that mean the same thing across runs. It is a poor candidate when rows are per-trade, free-form, or run-specific identifiers.

### Tier 1 — pilot-grade (stable keys, small, obvious value)

| Table | Page | Row key | Why ideal |
|---|---|---|---|
| **Structure Quality (BOS vs CHoCH)** | OrderBlockLab | `structure` (BOS / CHoCH / Limited Data) | 2–3 fixed rows; the canonical "did this edge hold up in another run?" question. **Pilot.** |
| **Direction** | OrderBlockLab | `direction` (Long / Short) | 2 fixed rows; trivially row-matched. |
| **Session performance** | OrderBlockLab / Failures | session (Asia / London / NY / …) — `SESSION_COLUMNS` | fixed enum; "did London hold up?" is a real recurring question. |

### Tier 2 — strong (stable enums, slightly higher cardinality)

| Table | Page | Row key | Notes |
|---|---|---|---|
| **News performance** | NewsLab | news-window bucket / impact tier | fixed buckets; watch for runs without news fields → "missing". |
| **OB quality** (width / age / penetration buckets) | OrderBlockLab | bucket label (`0–2 pips`, `4–12h`, `25–50%`, …) | fixed ordered buckets; good fit. |
| **HypothesisLab** baseline vs filtered rows | HypothesisLab | filter-condition key (`excl_choch`, …) | rows are named hypotheses — stable across runs that share the hypothesis set. |

### Tier 3 — possible later (needs care)

| Table | Page | Caveat |
|---|---|---|
| **EntriesLab selected-model tables** | EntriesLab | Rows are *scenarios* (entry models). EntriesLab is **already** a side-by-side scenario comparison by design, so inline compare here is mostly useful for **run-vs-run on the same model**, not scenario-vs-scenario. Lower priority. |
| Day-of-week / creation-hour | OrderBlockLab | fine keys, but lower analytical payoff. |

### Not candidates (explicitly out)

- Trade-level tables (TradeInspector worst-losses / best-wins), per-OB lists, anything keyed by a run-specific `trade_id`/`ob_id`. Rows don't match across runs.
- Free-form or single-row summary cards (use a KPI-delta strip instead, not this component).

---

## 3. Comparison Modes (Q2, Q6)

Model the comparison target as a small, explicit union. The corner control picks the **mode**; a secondary picker (only when the mode needs it) picks the concrete target.

| Mode | Target picker | What "current" compares against | Trade source |
|---|---|---|---|
| **None** (default) | — | nothing; single table | — |
| **Previous Run** | auto (project-ordered prior run) | the run immediately before the active one in the same project | `getRunData(prevRunId)` |
| **Selected Run** | run dropdown (imported/sidecar) | any other indexed run | `getRunData(selectedRunId)` (may need `reloadFullRunFromSidecar`) |
| **Selected Scenario** | scenario picker (family/threshold/fill) | the **same run**, different scenario | `useTradeUniverse(activeRunId, scenarioOverride)` |
| **Same run, different Trade Universe** | variant/scenario picker | e.g. current run *Baseline* vs current run *TE Next* | `useTradeUniverse(activeRunId, {family,threshold,fillMode,positionVariant})` |
| *(later)* Previous applied config / imported run | — | covered by Selected Run once config metadata is surfaced | — |
| *(later)* Baseline vs active scenario | one-click | shorthand for Selected Scenario where target = `{family:"baseline"}` | `universe.baselineTrades` is already on the universe object |

**Phase-1 modes:** `None`, `Previous Run`, `Selected Run`, `Baseline vs Active Scenario` (free — `baselineTrades` already exists on every universe). `Selected Scenario` / cross-universe are Phase 2.

### Trade Universe interaction (Q6)

Comparison must be **basis-and-universe-symmetric**: the comparison list is resolved through the *same* `resolveTradeUniverse` path as the current list, so the three canonical cross-run/cross-universe questions all reduce to "pick `runId` + `scenarioOverride` for side B":

- Current run **Baseline** vs current run **TE Next** → same `runId`, scenario A `{baseline}`, scenario B `{triggered_edge, …, next}`.
- Current run **TE Next** vs previous run **TE Next** → different `runId`, *same* `scenarioOverride` on both.
- Current run **Baseline** vs previous run **Baseline** → different `runId`, `{baseline}` on both.

Rule: the shell **carries the current table's universe descriptor** and applies it to side B unless the user overrides it. This prevents the silent apples-to-oranges trap of comparing Baseline-A against TE-Next-B by accident. Any coercion (e.g. `BOTH_UNAVAILABLE_NO_COMBINED`) surfaces as a warning chip on side B, reusing the universe's existing `warnings[]`.

---

## 4. Results Basis interaction (Q7)

This feature must be built *on top of* the planned `resultsBasis.js`, not beside it. Once `summarizeBuckets(trades, { keyOf, basis, account, bucketMode })` exists, both sides of the comparison route through it with the **same** `basis`/`account`, guaranteeing the delta is meaningful.

| Basis | Delta semantics | Notes |
|---|---|---|
| **Raw R** | reorder-safe; `ΔnetR`, `Δexpectancy`, `Δwin%`, `Δcount`, `ΔPF` are all directly comparable | default and safest comparison basis |
| **Current Equity · Contribution** | **do not show simple deltas by default** | contribution mixes edge with sequence position; comparing contribution across two different sequences is misleading. Show absolute values + a caveat, gate Δ behind an explicit opt-in. |
| **Current Equity · Isolated** | each bucket re-run from `startingBalance`; deltas are comparable again | the *correct* basis for "is BOS better than CHoCH across runs?" under Current Equity |

Design rule: **when basis = Current Equity + Contribution, the shell nudges the user toward Raw R or Isolated for comparison** (a one-line inline note), mirroring the roadmap's existing guidance. The compare shell never invents its own math — basis/account always come from the store (`RESULTS_BASIS`, `ACCOUNT_SETTINGS`) so the LENS bar and the compare drawer stay consistent.

---

## 5. Recommended UX (Q3, Q4-rows, Q5-metrics)

### 5.1 The corner control

A subtle ghost control in the table's top-right (next to the scope badge the Results Basis roadmap already puts there):

```
┌─ Structure Quality ───────────────  [ Baseline · Raw R ]   ⇄ Compare ▾ ─┐
```

`⇄ Compare ▾` opens a small menu: `None · Previous Run · Selected Run… · vs Baseline`. Selecting anything but None expands the table.

### 5.2 Default render: inline delta columns (recommended)

For dense research tables the **delta-column-inside-the-same-table** layout is the default. Each metric column gains a compact Δ sibling; rows stay matched 1:1.

```
Structure   | n   | Net R   Δ      | Win%   Δ      | Exp    Δ      | PF    Δ
────────────┼─────┼───────────────┼───────────────┼───────────────┼──────────────
BOS         | 142 | +38.2  ▲+6.1  | 54.2%  ▲+2.1  | +0.27  ▲+0.04 | 1.42  ▲+0.11
CHoCH       |  88 | +12.4  ▼−3.0  | 47.7%  ▼−1.4  | +0.14  ▼−0.02 | 1.12  ▼−0.05
Limited Data|   6 |  …only in compared run…                                    
```

- Δ cells reuse the existing success/danger color tokens (same as `ColoredR` / heatmap).
- Δ is `current − compared` by default (positive = current is better). The direction convention is shown in a tooltip and is metric-aware (lower DD is better → invert color).

### 5.3 Power render: expandable second table (toggle)

A `[ Δ inline | Stacked ]` toggle on the header switches to a **second full table rendered directly underneath** the first, with a thin labeled divider (`▼ Compared: Run B · Baseline · Raw R`). This is the literal "expands downward" behavior from the brief and is best when the user wants to read both runs' absolute numbers in full.

### 5.4 Why not the other options

- **Side-by-side** — rejected as default: candidate tables already carry 6–10 numeric columns; doubling width forces horizontal scroll and breaks the dense-table aesthetic. Offer it only as an opt-in on wide screens later.
- **Separate drawer / modal** — rejected: defeats the "without leaving the current page / inline" goal and hides the row alignment that makes the comparison legible.
- **Compact summary row only** — keep as a *collapsed* state: when the drawer is closed but a comparison is selected, show a one-line `vs Run B: Net R +25.8 ▲, Win% +0.6 ▲` ribbon so the signal survives collapse.

### 5.5 Row matching (Q4)

Match strictly by `rowKey` (the same key the table already passes to `DataTable`):

- BOS row ↔ BOS row, CHoCH ↔ CHoCH, London ↔ London.
- Key present on current only → render row, Δ cells show **"only in current"** (muted).
- Key present on compared only → append row at the bottom, label **"only in compared run"** (muted, italic).
- Ordering: preserve the current table's order (it already uses `preferredOrder` in `bucketRows`); compared-only rows append after, in their own order.
- Numeric Δ on a missing side is rendered as `—`, never as `+100%` or a fabricated zero (consistent with the "DO NOT fabricate" rule in `metrics.js`).

### 5.6 Metrics compared (Q5)

Driven by a `metrics` prop so each table opts into what's meaningful. Standard set and their Δ rendering:

| Metric | Δ | Better direction | Format |
|---|---|---|---|
| Net R | `curr − comp` | higher | `+0.0R`, colored |
| Win rate | `curr − comp` (pp) | higher | `+0.0pp` |
| Expectancy | `curr − comp` | higher | `+0.00` |
| Count | `curr − comp` | context (neutral) | integer, neutral color |
| Profit factor | `curr − comp` | higher | `+0.00`, null-safe (∞ handling) |
| Max DD (R) | `curr − comp` | **lower** (invert color) | `+0.0R` |

Count Δ is shown neutral (more trades isn't "better"), and a large count divergence triggers a **low-comparability flag** (see Risks).

---

## 6. Proposed Reusable Component / API (Q4, Q8)

Two layers: a **pure builder** (testable, no React) and a **thin React shell** (wraps `DataTable`).

### 6.1 Pure builder — `buildTableComparison()`

```
// lib/tableCompare.js  (pure, no React, no store)
buildTableComparison({
  currentRows,        // BucketSummary[] already rendered by the table
  comparedRows,       // BucketSummary[] for side B (same shape, same keyOf)
  rowKey = "label",   // the key both sides are grouped on
  metrics,            // ["netR","winRate","expectancy","count","profitFactor","maxDrawdownR"]
  betterDirection,    // optional override map; defaults baked in (DD = lower-better)
}) -> {
  rows: Array<{
    key,
    status: "matched" | "only_current" | "only_compared",
    current: BucketSummary | null,
    compared: BucketSummary | null,
    deltas: { [metric]: { value: number|null, dir: "up"|"down"|"flat", better: boolean|null } },
  }>,
  summary: { matched, onlyCurrent, onlyCompared, countDivergencePct },
}
```

### 6.2 React shell — `<TableCompareShell>`

```jsx
<TableCompareShell
  title="Structure Quality"
  currentRows={analytics.structureRows}     // already-built rows for side A
  buildRowsForRun={(bundle, scenario) =>     // how to rebuild rows for side B
    buildOrderBlockAnalytics(
      resolveTradeUniverse({ bundle, scenario }).trades
    ).structureRows
  }
  rowKey="structure"
  metrics={["netR", "winRate", "expectancy", "count"]}
  columns={structureColumns}                 // the table's existing DataTable columns
  activeRunId={run.id}
  defaultMode="none"
/>
```

Responsibilities of the shell:

1. Renders the corner `⇄ Compare ▾` control + scope badge.
2. On a non-None mode, resolves side-B's `{ runId, scenario }`, fetches the bundle (`getRunData`, lazy-hydrating via `reloadFullRunFromSidecar` if index-only), and calls the caller's `buildRowsForRun` — so the comparison rows come from the **same builder** as the current rows. This is the key correctness property: side A and side B are produced by identical code.
3. Calls `buildTableComparison()` and renders either the Δ-column `DataTable` or the stacked second `DataTable`.
4. Surfaces side-B `universe.warnings` and a low-comparability flag.

`buildRowsForRun` is the single integration seam each table provides. For tables already factored through `buildOrderBlockAnalytics`, it's a one-liner. Design note: the *long-term* clean version replaces the ad-hoc builder with `summarizeBuckets(trades, { keyOf, basis, account, bucketMode })` from `resultsBasis.js`, so `buildRowsForRun` collapses to `(bundle, scenario) => summarizeBuckets(resolve(bundle,scenario).trades, { keyOf, basis, account })`. Build the shell to accept *either* during the transition.

### 6.3 Optional convenience hook

```
useComparisonRows(buildRowsForRun, { mode, activeRunId, selectedRunId, scenarioOverride })
  -> { comparedRows, comparedLabel, loading, warnings, error }
```

Encapsulates the async bundle hydration + memoization so the shell stays declarative.

---

## 7. Data Model Requirements (Q9)

What must be true for side B to be computable:

1. **Row shape is uniform.** Both sides must be `BucketSummary`-shaped objects keyed by `rowKey`. Today bucket rows carry `{ label, count, wins, losses, netR, winRate, expectancy, profitFactor, … }` — already sufficient. (Long-term: standardize via `summarizeBuckets` return shape.)
2. **A second trade list is resolvable.** Provided by `resolveTradeUniverse({ bundle, scenario, fallbackVariant })`. No new resolver needed.
3. **Other runs' bundles are reachable.** `getRunData(runId)` returns the bundle, but indexed runs may be `storageMode: "index_only"` with no full trades. The shell must detect this and call `reloadFullRunFromSidecar(runId)` (async) before building rows. **This is the main new data dependency** and the reason side B needs a loading state.
4. **Run ordering for "Previous Run."** Needs a defined ordering — use `getProjectRuns(projectId)` order (or run `created_at`) to resolve "the run before the active one."
5. **Basis + account come from the store.** `RESULTS_BASIS` and `ACCOUNT_SETTINGS` (per the roadmap) must be read once and applied to both sides identically.
6. **No new persistence required for Phase 1.** The selected compare mode is page-local UI state. (Optionally persist last-used mode per table key in `localStorage` later — same pattern as account settings.)

---

## 8. Risks & Mitigations (Q10)

| Risk | Severity | Mitigation |
|---|---|---|
| **Different row categories between runs** (BOS-only vs BOS+CHoCH) | High | Explicit `only_current` / `only_compared` row statuses; never coerce a missing side to 0. |
| **Comparing apples to oranges** (Baseline-A vs TE-Next-B by accident) | High | Carry the current table's universe descriptor onto side B by default; show both sides' universe label in the divider; require an explicit override to diverge. |
| **Misleading deltas under Current Equity / Contribution** | High | Suppress simple Δ in Contribution mode; nudge to Raw R or Isolated; label clearly (reuses roadmap guidance). |
| **Low comparability from sample-size divergence** (n=142 vs n=11) | Medium | `countDivergencePct` in the summary; show a low-comparability chip; lean on the existing low-sample (`n<10`) flag already in `finalizeBucket`. |
| **Performance cost** (rebuilding analytics over a second full bundle, possibly lazy-loaded) | Medium | Build side B only when a non-None mode is active; memoize on `(runId, scenarioKey, basis)`; reuse the bundle if already hydrated; debounce target switches. The heavy cost is the *async sidecar hydration*, not the math — gate it behind the user opening the drawer. |
| **UI clutter** (doubling columns) | Medium | Δ-inline default with collapsible drawer; "Stacked" is opt-in; collapsed state degrades to a one-line ribbon, not nothing. |
| **PF / ∞ and divide-by-zero edge cases** | Low | Reuse `metrics.js` null conventions (`null` = undefined PF); render `—`, never `Infinity` or `NaN`. |
| **Stale comparison after scenario/run switch** | Low | Key the comparison memo on the universe descriptor; reset or re-resolve on `useDataset` notify. |

---

## 9. Suggested First Implementation Phase (Q11)

**Pilot: OrderBlockLab → Structure Quality (BOS vs CHoCH).** Chosen exactly per the brief — small table, clear `structure` keys, obvious value, low UI risk.

Phase-1 scope (smallest shippable slice):

1. `lib/tableCompare.js` — the pure `buildTableComparison()` builder + unit tests (the safest place to start; no UI risk, fully testable).
2. `<TableCompareShell>` supporting modes **None / Previous Run / Selected Run / vs Baseline** only.
3. Render mode: **Δ-inline columns** only (skip the stacked second table for v1).
4. Basis: **Raw R only** (no Current-Equity comparison until `resultsBasis.js` lands).
5. Wire it into the Structure Quality table via a `buildRowsForRun` one-liner over `buildOrderBlockAnalytics`.
6. Side-B bundle hydration via `getRunData` + `reloadFullRunFromSidecar`, with a loading state and warning surfacing.

Success criteria: open the OB Lab, pick "Previous Run," and see BOS/CHoCH rows gain colored ΔNet R / ΔWin% / ΔExp / Δcount, with correct missing-row handling and no fabricated zeros.

Phase 2 (after pilot proves out): Selected Scenario / cross-universe modes, the stacked second-table view, more candidate tables (Direction, Session, OB-quality), and migration of `buildRowsForRun` onto `summarizeBuckets`.

Phase 3: Current-Equity-aware comparison (Isolated deltas + Contribution caveats) once `resultsBasis.js` and the LENS bar exist; persisted per-table compare preference.

---

## 10. What NOT to Implement Yet (Q-final)

- **No Current-Equity / Contribution comparison** until `resultsBasis.js` exists — the math isn't centralized yet and Contribution deltas are unsafe.
- **No side-by-side layout** — defer; Δ-inline + stacked cover the need without the width cost.
- **No multi-target compare** (comparing against 3+ runs at once inline) — that's ComparisonLab's job at the page level; keep inline compare to exactly **one** side B.
- **No new global store slice / persistence** for compare state in Phase 1 — keep it page-local UI state.
- **No EntriesLab scenario-vs-scenario inline compare** — EntriesLab is already a side-by-side scenario surface; don't duplicate it.
- **No automatic background hydration** of other runs' full bundles — only hydrate on explicit user action (opening the drawer / choosing a target).
- **No rewrite of existing inline bucket math** as part of this feature — let the Results Basis consolidation own that; `TableCompareShell` should accept the current builders during the transition.

---

*End of audit. No implementation performed.*
