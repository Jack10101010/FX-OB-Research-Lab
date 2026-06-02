# Layer 3 — Edge Explorer — Audit & Design

**Mode:** AUDIT + DESIGN ONLY. No files modified, no implementation performed.
**Date:** 2026-05-29
**Builds on:** `TABLE_COMPARE_DRAWER_DESIGN.md` (Layer 1/2), `RESULTS_BASIS_IMPLEMENTATION_ROADMAP.md`, `RESULTS_BASIS_SCENARIO_ANALYTICS_AUDIT.md`.
**Scope:** Evolve the Table Compare system from *"compare this table"* (pairwise) toward *"explain this edge"* (one subject evaluated across a whole space of conditions).

> Layer 1 answers **"is A different from B?"** Layer 3 answers **"is A *real*?"** — does the BOS edge survive across runs, scenarios, symbols, timeframes, sessions, and results bases, and what conditions strengthen or break it.

---

## 0. Executive Summary

**Recommendation: Edge Explorer is a *separate surface* sitting on a *shared pure core*, not an expansion of `TableCompareShell`.**

`TableCompareShell` is intrinsically a **1-vs-1, in-place** widget (one table, one side-B). Edge Explorer is intrinsically a **1-vs-N cube**: one subject (BOS) evaluated across an N-dimensional grid of universes × runs × facets × bases. Forcing the cube into an in-table widget would distort both. But the two must share the *kernel*: the row-matching + delta engine (`buildTableComparison`) becomes the **inner cell-comparison primitive** Edge Explorer calls repeatedly, and every cell is the same `BucketSummary`/`ResultSummary` shape produced by the planned `resultsBasis.js`.

Two facts in the current codebase make this cheap:

1. **Runs are already a metadata-rich fact table** — every run carries `symbol`, `detectionTf`, `executionTf`, `rr`, `configSummary{…}`, `projectId`, `runRole`, `experimentType`. Edge Explorer's "across symbols / timeframes / runs" axes are *queries over existing fields*, not new data.
2. **A predicate registry already exists** — `failuresAnalytics.js` defines `{ key, label, group, matchFn(trade)→bool }` across Structure / Direction / Day / Hour / Archetype / OB-Quality. This is exactly the "facet" abstraction Edge Explorer needs. Promote it to a shared module instead of inventing a new one.

The single most important decision to make *now* (Phase 1) is to keep the **delta/match engine pure and standalone** and to make **subjects + universes serializable descriptors** (not closures), so the cube can reuse the kernel and cache/save edges later without a rewrite.

---

## 1. Layer 3 vs TableCompareShell — Evolve or Separate? (Deliverable 1)

### 1.1 The three layers, stated precisely

| Layer | Question | Cardinality | Surface |
|---|---|---|---|
| **L1 — Table Compare** | "Is this table different from one other run/scenario?" | 1 table × 1 compared side | In-place corner control on any table |
| **L2 — Multi-run comparison** | "How do these N runs stack up?" | N runs × run-level KPIs | Dedicated page (`ComparisonLab` already exists) |
| **L3 — Edge Explorer** | "Is *this one edge* robust, and what conditions it?" | 1 subject × M conditions (cube) | Dedicated drill surface launched from a row |

They are **not** the same widget at different sizes. L1 is pairwise and inline; L3 is a cube and dedicated. But they collapse onto one math core.

### 1.2 Decision: shared core, separate shell

```
                         ┌──────────────────────────────────────────┐
                         │           PURE MATH CORE (shared)         │
                         │  resultsBasis.summarizeTrades/Buckets()   │
                         │  tableCompare.buildTableComparison()  ←────┼── the delta/match kernel
                         │  edgeMath.buildEdgeCube()  (new, L3)       │
                         └──────────────────────────────────────────┘
                              ▲                 ▲                 ▲
              ┌───────────────┘        ┌────────┘        ┌───────┘
       <TableCompareShell>      <ComparisonLab>      <EdgeExplorer>   ← three shells, one core
            (L1, inline)          (L2, page)            (L3, drill)
```

- `buildTableComparison()` (from the L1 design) is the **pairwise kernel**. Edge Explorer calls it cell-by-cell when the user drills into a comparison.
- Edge Explorer adds **one new pure builder**, `buildEdgeCube()`, that orchestrates many `summarizeTrades` calls into a grid. It does *not* re-implement row matching or delta math — it reuses the kernel.
- The launch gesture unifies them: in L1, clicking a row's `⇄` compares it to one side. In L3, clicking the same row's `⌕ Explain` opens Edge Explorer with that row as the **subject**. Same row, two verbs.

**Net:** evolve the *core*, separate the *surface*.

---

## 2. Edge Explorer System Design (Deliverable 2)

### 2.1 Core concept

An **edge** is a *subject predicate* over trades — most often "the trades in row X of table Y" (e.g. `structure === "BOS"`). Edge Explorer takes that subject and evaluates its performance across a chosen set of **axes**, producing a cube of `ResultSummary` cells, then scores **robustness** and **conditioning**.

### 2.2 The axes (the space an edge is explored across)

| Axis | Values | Resolved via | Answers |
|---|---|---|---|
| **Universe** | Baseline, TE Same, TE Next, Penetration, future entry models | `resolveTradeUniverse({bundle, scenario})` | "Does BOS survive across scenarios?" |
| **Run** | this run, previous run, any selected runs | `getRunData` / `reloadFullRunFromSidecar` | "Does BOS survive across runs?" |
| **Symbol / Timeframe** | grouping of runs by `symbol` / `detectionTf` / `executionTf` | run metadata query (`selectRuns`) | "Does BOS survive across symbols/TFs?" |
| **Facet (conditioning)** | Session, Direction, Day, Hour, OB-width, Age, Penetration… | shared predicate registry `matchFn` | "What conditions improve/damage BOS?" |
| **Basis** | Raw R / Current Equity (Isolated) | `resultsBasis` basis param | "Does the edge hold in account terms?" |

A cube cell = `subjectPredicate ∧ facetPredicate` evaluated over `universe(run).trades`, summarized under `basis`. Every cell is one `summarizeTrades()` call.

### 2.3 UI model

A dedicated **Edge Explorer** drill surface (full-width drawer or route `/edge`), launched from any eligible row:

```
┌─ Edge Explorer · Subject: STRUCTURE = BOS ──────────────────  Basis: [ Raw R ▾ ] ─┐
│                                                                                    │
│  ROBUSTNESS  ●●●●○  Robust    survives 6/7 universes · 4/5 runs · σ(expectancy)=.04│
│                                                                                    │
│  ┌─ Across Universes ──────────┐  ┌─ Across Runs ───────────────┐                 │
│  │ Baseline     +0.27  ▲       │  │ Run A (cur)  +0.27          │   ← matrix /     │
│  │ TE Same      +0.24  ▲       │  │ Run B (prev) +0.22          │     heatmap of   │
│  │ TE Next      +0.31  ▲▲      │  │ Run C        +0.05  ⚠ thin  │     the subject  │
│  │ Penetration  −0.02  ▼ break │  │ EURUSD M5 ×3 +0.26 (avg)    │     metric       │
│  └─────────────────────────────┘  └─────────────────────────────┘                 │
│                                                                                    │
│  ┌─ Conditioning · what helps / hurts BOS ───────────────────────────────────┐    │
│  │ London session   +0.41  ▲▲ strengthens     Asia session   +0.03  ▼ weakens │    │
│  │ Long direction   +0.33  ▲                   Wide OB >10p   −0.08  ▼ damages │    │
│  └───────────────────────────────────────────────────────────────────────────┘    │
│                                                                                    │
│  ▸ Drill any cell → opens the L1 stacked compare table for that pair               │
└────────────────────────────────────────────────────────────────────────────────────┘
```

Three blocks, all reading from one cube:

1. **Robustness header** — single verdict + the evidence (universe survival, run survival, dispersion).
2. **Survival matrices** — the subject metric across the Universe axis and the Run axis (incl. symbol/TF rollups). Heatmap reuses `DataTable`'s existing `heatmap` prop.
3. **Conditioning panel** — single-facet sweep holding the subject fixed: which facets *strengthen* vs *damage* the edge (the "what conditions improve/damage BOS" question).

Drilling any cell hands off to the **L1 stacked compare table** — Edge Explorer is the map, Table Compare is the street view.

### 2.4 The research questions, mapped to mechanics

| User question | Mechanic |
|---|---|
| Is BOS genuinely robust? | dispersion of subject metric across Universe+Run axes → robustness score |
| Does BOS survive across runs? | Run axis survival row (sign + thinness flags) |
| Does BOS survive across scenarios? | Universe axis survival row |
| What conditions improve BOS? | Conditioning sweep, positive Δ vs subject baseline |
| What conditions damage BOS? | Conditioning sweep, negative Δ |
| What combinations create the strongest BOS edge? | **facet-intersection search** — Phase 4 (combinatorial, gated) |

---

## 3. Interactions With Existing Systems (Deliverable 3)

### 3.1 TradeUniverse

Edge Explorer's **Universe axis is literally a list of `scenarioOverride`s** fed to `resolveTradeUniverse({ bundle, scenario })`. No new resolution logic. The subject predicate is applied *after* universe resolution: `universe.trades.filter(subjectPredicate)`. Universe `warnings[]` (e.g. `BOTH_UNAVAILABLE_NO_COMBINED`) propagate to the corresponding cells as flags, so a coerced fill-mode never silently distorts a cube cell.

### 3.2 Results Basis

The **Basis is a cube-wide parameter**, not per-cell. Every cell routes through `resultsBasis.summarizeTrades(trades, { basis, account })`. Rules carried over from the L1 design:

- **Raw R** = default and the only safe basis for cross-run/cross-universe dispersion (reorder-safe).
- **Current Equity** comparisons must use **Isolated** mode per cell (re-run from `startingBalance`); **Contribution** mode is *disabled* in Edge Explorer because contribution mixes edge with sequence position and cannot be compared across different sequences. The basis selector hides Contribution in this surface.

### 3.3 Current Equity

Current-Equity Edge Explorer answers "is this edge worth real money after compounding?" Each cell becomes an isolated account simulation of `subject ∧ facet` trades. Account config comes from the store (`ACCOUNT_SETTINGS`), shared with RunDetail and the LENS bar, so the number matches what the rest of the app shows. Because compounding is sequence-dependent, the cube records `sequenceUsed: true` and the conditioning panel adds a caveat that small-n cells are unstable under compounding.

### 3.4 ComparisonLab (L2)

ComparisonLab is **run-level, baseline, page-scoped**; Edge Explorer is **edge-level, scenario-aware, drill-scoped**. Clean division of labor:

- ComparisonLab: "which of my 5 runs is best overall?" (KPIs, equity curves).
- Edge Explorer: "is the BOS *component* of my strategy real?" (one subject, many conditions).
- Bridge: from a ComparisonLab run set, "Explain edge across these runs" pre-loads the Run axis with that exact selection. ComparisonLab's existing run-picker (`importedRuns`, `getRunData`) is the prototype for Edge Explorer's Run-axis picker — reuse the component.

### 3.5 OrderBlockLab

Primary launch point. Every `bucketRows()` table (structure, direction, session, OB-quality, width, age, penetration…) gets an `⌕ Explain` affordance per row alongside the L1 `⇄ Compare`. The row's grouping function *is* the subject predicate — `buildOrderBlockAnalytics` already encodes these as the `labelFn`s passed to `bucketRows`, so OB Lab can hand Edge Explorer a ready-made `subjectPredicate` with zero new categorization logic.

### 3.6 Future protection analytics

Protection analytics already has its own **dimension/field registry** (`protectionAnalytics.js` → `DATA_QUALITY_FIELDS`, `structureTag`, `obOriginSession`, penetration, breach flags) and the failures registry has archetype facets (`hard_invalidation`, `close_confirmed`, `fast_stopout`, `slow_bleed`). These should feed Edge Explorer as **additional facet axes**: "does BOS survive *after* protection rules?" becomes a Universe-axis entry (a protection scenario) plus archetype facets in the conditioning panel. Designing the facet registry as shared *now* means protection plugs in later without bespoke wiring.

---

## 4. Reusable Data Structures (Deliverable 4)

All serializable (no closures in stored state) so edges can be cached, saved, and shared.

```
// A subject is a *reference* to a predicate, not the predicate itself.
EdgeSubject {
  dimension: "structure" | "direction" | "session" | "ob_width" | ...,
  value:     "BOS",                       // the row key being explained
  facetKey?: "excl_bos"|...,              // optional link to the shared registry entry
  label:     "Structure = BOS",
}

UniverseRef   { runId, scenario:{family,threshold,fillMode,positionVariant} }
FacetRef      { key, group, label }       // resolves to a matchFn via the registry
RunRef        { runId, symbol, detectionTf, executionTf }  // metadata snapshot

AxisSpec {
  kind: "universe" | "run" | "symbol" | "timeframe" | "facet",
  values: Array<UniverseRef | RunRef | FacetRef | string>,
}

EdgeQuery {
  subject:  EdgeSubject,
  axes:     AxisSpec[],                    // 1–2 primary axes + optional conditioning facets
  basis:    "raw_r" | "current_equity",
  account?: AccountConfig,                 // required when current_equity
  bucketMode?: "isolated",                 // contribution disallowed here
}

EdgeCell {
  coords:   { universe?: UniverseRef, run?: RunRef, facet?: FacetRef },
  summary:  ResultSummary,                 // SAME shape as L1 rows & resultsBasis output
  n:        number,
  flags:    Array<"thin"|"missing"|"coerced"|"sequence_unstable">,
  warnings: Warning[],                     // propagated from universe resolution
}

EdgeCube {
  subject:  EdgeSubject,
  basis,    account,
  cells:    EdgeCell[],                    // flat list, addressable by coords
  axisIndex: { [axisKind]: values[] },     // for grid rendering
}

RobustnessSummary {
  verdict:  "robust" | "mixed" | "fragile",
  universeSurvival: { passed, total },     // sign-positive & non-thin cells
  runSurvival:      { passed, total },
  dispersion:       { metric:"expectancy", stdev, iqr },
  strongestCondition: FacetRef|null,       // best conditioning facet
  weakestCondition:   FacetRef|null,
  caveats: string[],                       // thin-sample / sequence warnings
}
```

**Invariant:** `EdgeCell.summary`, L1 row, and `resultsBasis` output are the *same type* (`ResultSummary`/`BucketSummary`). This is what lets the L1 delta kernel operate on cube cells unchanged.

---

## 5. Reusable Builders (Deliverable 5)

```
// lib/facets.js  (NEW — promote the existing failures/protection registries)
FACET_REGISTRY: Array<{ key, label, group, matchFn(trade)→bool }>
getFacet(key) -> FacetSpec
facetsByGroup() -> { [group]: FacetSpec[] }
// ↑ single source of truth, shared by Failures, Hypothesis, Protection, Edge Explorer

// lib/edgeMath.js  (NEW — the only new math, pure, no React/store)
resolveSubjectPredicate(subject) -> (trade)=>bool      // from EdgeSubject
buildEdgeCube(query, {
  resolveTrades,    // (UniverseRef) => trades   — injected; wraps resolveTradeUniverse + hydration
  summarize,        // resultsBasis.summarizeTrades — injected
}) -> EdgeCube
scoreEdgeRobustness(cube) -> RobustnessSummary
buildConditioning(cube, baselineCell) -> Array<{ facet, delta, effect:"strengthens"|"weakens" }>

// REUSED, unchanged:
tableCompare.buildTableComparison(...)   // pairwise drill kernel (from L1)
resultsBasis.summarizeTrades/Buckets(...) // every cell's math
resolveTradeUniverse(...)                 // every universe cell's trade list
```

Design notes:

- `buildEdgeCube` is an **orchestrator with injected dependencies** (`resolveTrades`, `summarize`) so the pure layer never imports the store. The React shell wires real implementations in (mirrors how L1 injects `buildRowsForRun`).
- Cross-run cells need **async trade resolution** (sidecar hydration of index-only runs). `resolveTrades` returns a promise; `buildEdgeCube` builds the cell grid lazily / on demand so opening the explorer doesn't hydrate every run at once.
- The conditioning sweep is just `buildEdgeCube` with a single Facet axis and the subject held fixed, then `buildConditioning` diffs each facet cell against the subject baseline using the **same delta math as L1**.

---

## 6. Architecture Decisions To Make Now (Deliverable 6)

These cost little in Phase 1 but prevent a Layer-3 rewrite:

1. **Keep the delta/match engine standalone and pure.** Ship `buildTableComparison()` as `lib/tableCompare.js` (already the L1 plan). Edge Explorer's cube reuses it as the cell kernel — only possible if it isn't welded into the React shell.
2. **Standardize the cell/row summary shape from day one.** Make L1 rows return `resultsBasis`'s `ResultSummary`/`BucketSummary`. If L1 ships a bespoke row shape, every cube cell needs an adapter later.
3. **Subjects and universes are serializable descriptors, never closures.** `EdgeSubject` + `UniverseRef` must be plain JSON so edges can be cached, deep-linked, saved to projects, and memoized. Decide the descriptor schema in Phase 1 even though only L1 uses it.
4. **One shared facet registry.** Promote `failuresAnalytics`'s `{key,label,group,matchFn}` list (and the protection field list) into `lib/facets.js` now. Avoid a 4th private copy; Edge Explorer's conditioning axis depends on it.
5. **Runs are a queryable collection.** Add a thin `selectRuns(filter)` selector over existing run metadata (`symbol`, `detectionTf`, `projectId`, `runRole`) so "all EURUSD M5 runs" is one call. The data already exists; only the selector is missing.
6. **Basis + account flow as explicit params through every builder.** No hidden store reads below the React layer. The cube must be reproducible from `(EdgeQuery)` alone.
7. **Async, lazy trade resolution is a first-class contract.** Decide now that `resolveTrades` is promise-based and cells hydrate on demand, with `thin`/`missing`/`coerced` flags — retrofitting laziness into a synchronous cube is painful.
8. **Subject ⊆ Universe ordering is fixed:** always resolve the universe first, then apply the subject predicate. Lock this so a subject can never accidentally pull trades from outside its universe.

---

## 7. Additions To The Table Compare Roadmap For L3 Compatibility (Deliverable 7)

Concrete amendments to the L1/L2 plan so nothing has to be unwound later:

| Add to L1/L2 now | Why it matters for L3 |
|---|---|
| Return `BucketSummary`/`ResultSummary` from `buildRowsForRun` | cube cells == table rows; shared kernel |
| Ship `buildTableComparison` as a pure standalone module | becomes the cube's pairwise drill kernel |
| Accept an optional `subjectPredicate` prefilter on the compare shell | "compare just the BOS slice" — the bridge gesture to L3 |
| Use serializable `UniverseRef` (not a live universe object) as the compare target | edges/comparisons become cacheable & deep-linkable |
| Add an `⌕ Explain` affordance next to `⇄ Compare` on eligible rows (no-op stub in L1) | reserves the launch gesture; one row → two verbs |
| Centralize facets in `lib/facets.js` and have Hypothesis/Failures read from it | conditioning axis depends on a single registry |
| Add `selectRuns(filter)` run selector | Run / Symbol / Timeframe axes |
| Make side-B trade resolution promise-based with hydration flags | cross-run cube cells reuse the same loader |

If those eight land inside Phase 1/2, Phase 3 is **additive** (one new builder + one new shell), not a refactor.

---

## 8. Phased Roadmap (Deliverable 8)

### Phase 1 — Table Compare (pairwise, inline)
- `lib/tableCompare.js` pure kernel + tests; `<TableCompareShell>`; Δ-inline columns; Raw R; modes None / Previous Run / Selected Run / vs Baseline.
- **Pilot:** OrderBlockLab Structure Quality (BOS vs CHoCH).
- *L3-readiness deliverables:* `BucketSummary` return shape, serializable `UniverseRef`, `⌕ Explain` stub, `subjectPredicate` prop.

### Phase 2 — Multi-run comparison (run-level, N runs)
- Extend the stacked view to N compared columns; integrate with the existing `ComparisonLab` run-picker; add `selectRuns(filter)` and run-metadata grouping (symbol/TF).
- Land `lib/facets.js` (shared registry) and migrate Hypothesis/Failures reads onto it.
- Results Basis + Current Equity (Isolated) comparisons enabled here once `resultsBasis.js` ships.

### Phase 3 — Edge Explorer (one subject, many conditions)
- `lib/edgeMath.js`: `buildEdgeCube`, `scoreEdgeRobustness`, `buildConditioning`; promise-based `resolveTrades` with lazy cell hydration.
- `<EdgeExplorer>` drill surface: robustness header, Universe/Run survival matrices (heatmap via `DataTable`), conditioning panel; cell-drill hands off to the L1 stacked compare.
- Launch from any OB Lab row's `⌕ Explain`. Raw R first; Current-Equity (Isolated) second.
- Protection scenarios + archetype facets wired in as additional axes.

### Phase 4 — Advanced research / cross-run intelligence
- **Combination search:** facet-intersection scan to surface "strongest BOS edge = London ∧ Long ∧ OB 5–10p" (combinatorial, sample-size-gated, multiple-comparison-aware).
- **Edge ranking & watchlist:** rank all subjects by robustness; persist saved edges to projects; deep-linkable edge URLs.
- **Cross-run intelligence:** auto-flag edges that decayed between runs; symbol/TF generalization scores; optional scheduled "edge drift" digest.
- **Guardrails:** false-discovery controls, minimum-n thresholds, and explicit "exploratory, not confirmatory" labeling baked into ranking outputs.

---

## 9. What NOT To Do Yet

- **Don't build the cube in Phase 1.** Only reserve the seams (shape, descriptors, `⌕ Explain` stub, facet registry).
- **Don't enable Contribution basis in Edge Explorer** — Isolated only; Contribution is not cross-comparable.
- **Don't auto-hydrate every run** when the explorer opens — lazy, on-demand cells only.
- **Don't ship combination search before robustness + conditioning** — combinatorics without sample-size guards manufactures false edges.
- **Don't fork the facet definitions** — one registry, or the conditioning axis silently diverges from Failures/Hypothesis.
- **Don't present robustness as confirmatory** — Edge Explorer is an exploratory microscope; label dispersion/survival as evidence, not proof.

---

*End of audit. No implementation performed.*
