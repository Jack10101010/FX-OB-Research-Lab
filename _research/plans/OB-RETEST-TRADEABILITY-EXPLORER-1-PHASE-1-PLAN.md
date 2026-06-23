# OB Retest — Tradeability Explorer (Phase 1 deliverable)

Audit + design. **Part A is implemented; Part B is design-only (no code written).**

---

## Part A — RR capture thresholds (DONE)

Changed `RR_THRESHOLDS` from `[0.25, 0.5, 1, 1.5, 2, 3, 5]` to
`[1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5]`.

Files touched:

- `frontend/src/data/obRetestMonetization.js` — the constant. `buildRrCaptureCurve`
  is fully threshold-driven (`thresholds.map(...)`), so every capture point, the
  monotonic-curve guarantee, and `medianMfeR` propagate automatically.
- `frontend/src/data/__validation__/obRetestMonetization.logictest.cjs` — Test 1
  assertions rewritten for the new set (dropped the `≥0.25R`/`≥0.5R` checks, added
  `≥2.5R`; updated the exact-thresholds assertion). **38/38 pass.**
- `frontend/src/data/researchGlossary.js` — `retest_rr_capture` definition now
  enumerates the new R multiples.

Deliberately **not** changed:

- `buildDecayByRetest` `capture1R` / `capture2R` — these are fixed 1R/2R *reference
  anchors* for the per-retest decay table (UI columns `≥1R` / `≥2R`), not derived
  from `RR_THRESHOLDS`. Both values remain inside the new set; changing them would
  alter unrelated UI and is out of scope for "capture thresholds".
- `RetestLabTab.jsx` capture chips read `pt(1)`, `pt(2)`, `pt(5)` — all three R
  values still exist in the new set, so the chips render unchanged. The RR table
  (`rows={rrCapture.points}`) renders dynamically and now shows 9 rows instead of 7.

No backend / importer / store / Python tracker changes (none reference the JS
constant; the backend RR curve is its own list and was explicitly out of scope).

---

## Part B — Tradeability Explorer (design audit, NOT implemented)

### The question it answers

> "When this cohort works, how should it be traded?"

Edge Discovery already answers *whether* a cohort holds (hold/reaction/failure
rates). Tradeability Explorer answers the **monetization** follow-on for the same
cohort: how far it runs, what target is realistic, and where to move to break-even.

### The central architectural fact: two grains

Everything below follows from one observation. The lab has **two different units of
analysis**, and Tradeability Explorer is the first feature that must fuse them:

| Layer | Unit (grain) | Lives in | Produces |
|---|---|---|---|
| Edge Discovery / research | **one retest *event*** | `obRetestResearch.js` (`enrichRetestEvents` → `groupRetestsByDimension`) | hold %, reaction success %, weak-hold %, failure %, avg/median candles-to-failure |
| Monetization | **one *order block*** (MFE-before-death is a single number per OB) | `obRetestMonetization.js` (`buildRrCaptureCurve`, `buildDecayByRetest`, `buildTtiBuckets`) | median MFE R, 1R…5R capture, TTI distribution, per-retest decay |

A cohort filter ("London BOS bullish") must therefore slice **both** an event list
and an OB list, and the two slices do not have a 1:1 mapping (one OB → many events).
This is the whole design problem; the rest is consequences of it.

### Dimensions split into two families

Whether a dimension can carry the full monetization payload depends on whether it is
a property of the **OB** or of the **event**:

- **OB-stable dimensions** — the same for every retest of that OB:
  `byStructure`, `byDirection`, `byStructureDirection`, `byObSize`,
  `byOriginSession`, and all of the C2 origin-candle dimensions
  (`byOriginBodyDominance`, `byOriginWickDominance`, `byDominantWickSide`,
  `byOriginRange`, `byOriginImpulse`).
  → You can group the **OB list** by these directly. **Full monetization output is
  valid** (median MFE-before-death, RR capture curve, suggested target, BE trigger).

- **Event-varying dimensions** — differ across retests of the same OB:
  `byRetestNumber`, `byRetestSession`, `bySameSession`, `byEntryPenetration`,
  `byPenetration`, `byTimeSince*`, `byFirstTouchOutcome`, `byFailureBehavior`,
  `byReactionQuality`.
  → An OB appears in several of these cohorts, but `mfeBeforeDeathPips` is a single
  OB-level number — attributing it to one retest cohort is **ambiguous**. For these,
  the honest monetization anchor is the **retest-anchored** MFE
  (`mfeAfterR1/R2/R3Pips`), which `buildDecayByRetest` already exposes for
  `byRetestNumber`. Other event dimensions have **no clean OB-level capture** and
  should show **event-grain reaction/hold/failure only**, with monetization columns
  marked N/A — not faked.

**This distinction must be encoded in the data, not left to the UI.** Each dimension
gets a `grain: "ob" | "event"` (and for event dims, an optional `mfeAnchor` such as
`"r1"`). The explorer renders the monetization block only for `grain: "ob"` (or for
the retest-number special case) and otherwise renders the reaction/hold/failure
block alone. This is what keeps us from duplicating or, worse, fabricating numbers.

### Outputs, and where each already exists

| Requested output | Source today | New? |
|---|---|---|
| Reaction Success % | `groupRetestsByDimension` → `reactionSuccessRate` | reuse |
| Window Hold % | `groupRetestsByDimension` → `windowHoldRate` | reuse |
| Eventual Failure % | OB-level `eventualFailureRate` (summary `obLevel`) | reuse |
| Median MFE (R) | `buildRrCaptureCurve` → `medianMfeR` (per-cohort call) | reuse, re-scoped |
| 1R / 2R / 3R / 5R capture | `buildRrCaptureCurve` points (per-cohort call) | reuse, re-scoped |
| **Suggested Target** | — | **new derivation** from the capture curve |
| **Suggested BE Trigger** | — | **new derivation** from the capture curve |

Only the two "suggested" outputs are genuinely new logic. Everything else is an
existing function called against a **cohort-scoped subset** instead of the whole run.

#### Suggested Target / BE Trigger — the only new math

Both are pure functions of the per-cohort RR capture curve plus reaction stats; no
new scan of candles. A defensible first definition (to refine empirically):

- **Suggested Target** = the largest R threshold whose capture share ≥ a floor
  (e.g. 50%), i.e. the furthest target a majority of the cohort's zones actually
  reached before dying. Falls back to median MFE R when nothing clears the floor.
- **Suggested BE Trigger** = the R level at which the marginal capture gain flattens
  (the "knee" of the curve) — beyond it, holding for more R loses zones faster than
  it adds reward. Conservative default: the smallest threshold with capture ≥ ~70%.

These live next to the curve they derive from, as a new
`buildTradeabilityProfile(cohortOBs, cohortEvents, orderBlocks)` that **composes the
existing builders** and adds only the target/BE derivation — it must not re-implement
capture or reaction math.

### Reuse map (what to call, what to add)

```
buildTradeabilityRows(enrichedEvents, perOB, orderBlocks, dimensionKey, {minN})
  ├─ groupRetestsByDimension(events, dim.fn)         ← reaction/hold/failure  (reuse, unchanged)
  ├─ for OB-grain dims: group perOB by the OB-stable key, then per cohort:
  │     ├─ buildRrCaptureCurve(cohortOB, orderBlocks) ← capture + medianMfeR  (reuse)
  │     └─ deriveSuggestedTargetAndBE(curve, reactionRow) ← NEW (small, pure)
  └─ for event-grain dims: monetization columns = N/A (except byRetestNumber → decay anchors)
```

The join key already exists: `obJoinKey` / `obLevel` keys are shared by both layers,
so grouping `perOB` by an OB-stable dimension reuses the same accessor `fn`s defined
in `RETEST_DIMENSIONS` (they read enriched fields that are OB-stable for that family).

### Compute-once vs derive-on-demand

- **Compute once** (in `useRetestData`, memoised like the existing
  `edgeBreakdowns` / `monetizationSummary`): the full set of tradeability rows for
  **every OB-grain dimension**, because the inputs (`enrichedEvents`, `perOB`,
  `orderBlocks`) only change when the run/config changes. This mirrors how
  `buildRetestEdgeBreakdowns` already precomputes all dimensions up front.
- **Derive on demand** (cheap, in the component): sort order, the selected dimension
  tab, the active R-floor for the "suggested target" slider if we expose one. None of
  these touch the heavy grouping.

Net: no per-interaction recomputation; one memo keyed on `(run, config, minN)`.

### UX placement — recommendation: **extend Edge Discovery, don't add a top section**

Render order today: `BasisBanner → ConfigBar → RetestIntelligence → SummaryCards →
SessionMatrix → EdgeDiscoveryTabs → MonetizationSection → EventTable`.

Two viable options:

- **Option 1 (recommended): a "Tradeability" view-mode toggle inside Edge Discovery.**
  Edge Discovery already owns the dimension tabs (`RETEST_DIMENSION_GROUPS`) and the
  cohort concept. Add a toggle that swaps the table's columns from *"does it hold"*
  (reaction/hold/failure) to *"how to trade it"* (median MFE, capture, suggested
  target/BE). Same tabs, same rows, same cohort — just a different column set over
  the **same** `buildTradeabilityRows` output.
  - Pros: zero new IA, reinforces that tradeability is the *second question* about the
    same cohort; naturally communicates the grain limitation (event-grain tabs simply
    grey the monetization columns); no duplicated dimension navigation.
  - Cons: Edge Discovery component grows; needs the v2.1 null-gate (monetization
    columns hidden when `monetizationSummary.available === false`).

- **Option 2: a standalone `TradeabilitySection` between `MonetizationSection` and
  `EventTable`.** A dimension picker of its own.
  - Pros: isolated, easy to gate entirely on v2.1.
  - Cons: duplicates the dimension-tab IA, invites divergence between "edge" cohorts
    and "tradeability" cohorts, and re-asks the user to pick a dimension they just
    picked next door.

Recommendation: **Option 1.** It is strictly less surface area, keeps a single cohort
definition, and the column-set toggle is the cleanest expression of "whether vs how".
`MonetizationSection` stays as the run-wide summary (the unconditioned curve); Edge
Discovery's new mode is the *conditioned* version of it.

### Avoiding duplicate calculations — rules

1. Reaction/hold/failure come **only** from `groupRetestsByDimension`. Tradeability
   never recomputes them.
2. Capture/median-MFE come **only** from `buildRrCaptureCurve`, called with a cohort
   subset. No second capture implementation.
3. The only new function is `deriveSuggestedTargetAndBE(curve, reactionRow)` plus the
   thin `buildTradeabilityRows` orchestrator. Both are pure, both are unit-tested in a
   new `obRetestTradeability.logictest.cjs`.
4. Grain rules live in the dimension registry (`grain` / `mfeAnchor`), so the UI never
   decides which numbers are valid.

---

## Recommended Phase 2 implementation plan

Scoped, test-first, v2.1-gated. Each step is independently committable.

**Step 1 — Dimension registry metadata (no behavior change).**
Add `grain: "ob" | "event"` and optional `mfeAnchor` to each entry in
`RETEST_DIMENSIONS`. Pure annotation; existing Edge Discovery ignores it.
Files: `obRetestResearch.js`. Test: extend `obRetestResearch.logictest.cjs` to assert
every dimension declares a grain.

**Step 2 — Tradeability builder (pure data layer).**
New `frontend/src/data/obRetestTradeability.js` exporting
`deriveSuggestedTargetAndBE(curve, reactionRow)` and
`buildTradeabilityRows(events, perOB, orderBlocks, dimKey, {minN})`. Composes the
existing research + monetization builders; adds only the suggested-target/BE math;
returns rows with both the reaction block and (for OB-grain dims) the monetization
block, plus an explicit `monetizationAvailable` flag per dimension.
Files: new module only. Test: new `obRetestTradeability.logictest.cjs` covering
OB-grain vs event-grain, the suggested-target floor logic, the BE knee logic, the
v1/v2 null-gate, and parity that reaction numbers equal `groupRetestsByDimension`'s.

**Step 3 — Wire into the hook (compute-once memo).**
In `useRetestData`, add a `tradeability` memo (keyed on run/config/minN, gated on
v2.1) that runs `buildTradeabilityRows` for all OB-grain dimensions and exposes it
alongside `edgeBreakdowns`. No UI yet.
Files: `useRetestData.js`. Test: the existing hook smoke path.

**Step 4 — UI: Edge Discovery view-mode toggle (Option 1).**
Add a "Whether it holds / How to trade it" toggle to the Edge Discovery tabs. In
tradeability mode, swap to the monetization column set; grey + tooltip the columns
for event-grain dimensions; hide the whole mode when `monetizationSummary.available
=== false`. Reuse `MetricChip` + `TermTip`; add glossary keys for "Suggested Target"
and "Suggested BE Trigger".
Files: the Edge Discovery component(s) under `components/lab/retest/`,
`researchGlossary.js`. Test: visual QA pass.

**Step 5 — Findings + docs.**
Record the first conditioned tradeability observations in `docs/ai/FINDINGS.md`
(reproduce on ≥2 runs before graduating), update `PROJECT_STATUS.md` /
`CURRENT_WORKSTREAM.md`, and note the OB-grain vs event-grain rule in `DECISIONS.md`
so future dimensions inherit it.

**Explicitly out of scope for Phase 2:** backend/exporter changes (the Python tracker
already emits per-OB MFE/decay; a backend tradeability aggregate is a later parity
phase), cost/spread-adjusted targets, and multi-dimension (cross-tab) cohorts —
single-dimension first, matrices later.
