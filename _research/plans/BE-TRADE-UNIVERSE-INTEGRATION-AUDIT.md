# BE-TRADE-UNIVERSE-INTEGRATION — AUDIT

> Mode: **AUDIT ONLY**. No implementation. Goal: make BE / Selective BE
> first-class **Result Views / Trade Universes** so every page reads the same
> `universe.trades`. One source of truth; no parallel BE interpretation.

---

## 1. Files read

- `data/tradeUniverse.js` — pure universe resolver (`resolveTradeUniverse`, `selectTrades`, `buildCanonicalKey`, `derivePrimaryResultView`, the `entryTradesByMode`/`collectAllEntryKeys` option tree). Defines the `TradeUniverse` shape.
- `data/useTradeUniverse.js` — React hook: `useTradeUniverse(runId, scenarioOverride)` → `getTradeUniverse()` (store read) wrapped in a `useMemo` keyed on the dataset.
- `data/store.js` — canonical `state.scenario` (`DEFAULT_SCENARIO`), `setScenario`, `getTradeUniverse`, persistence (`LS_SCENARIO`), `bundleFor`.
- `data/useRunVariant.js` + `data/runVariantResolve.js` — Result View ownership for a run: `{ resultView, setResultView, universe }`; `setResultView` writes through `setScenario`.
- `pages/strategyMap/ScenarioSelector.jsx` — hierarchical picker (Family → Threshold → Arm mode → Variant + Directional) driven by `useResolvedScenario` outputs; `onScenarioChange → setScenario`.
- `pages/strategyMap/useResolvedScenario.js` — Strategy Map's resolver; imports the SAME pure helpers from `tradeUniverse.js`. Produces `trades`, `orderBlocks`, overlays, stats.
- `pages/RunDetail.jsx`, `pages/ProtectionLab.jsx`, `components/lab/protection/BreakevenTab.jsx`, `pages/StrategyMap.jsx`, `pages/ComparisonLab.jsx`, `components/lab/failures/FailuresWorkspace.jsx`, `pages/Overview.jsx`, `pages/NewsLab.jsx`, `pages/OrderBlockLab.jsx`, `pages/TradeInspector.jsx` — consumers.
- `data/selectiveBeUniverse.js` — pure mixed-BE builder (`buildSelectiveBeUniverse`, `matchesCohort`, `selectedFilterLabel`, `stableTradeId`).
- `data/beResolve.js` — `resolveBeScenarioSource` / `findBeScenario` (nested `[mode][entryVariantKey][beKey]`), `buildExactBeSummary`, `hasAnyExactBe`.
- `data/importer.js` — bundle shape: `tradesByVariant`, `entryResults.tradesByMode`, `beResults[mode][entry][beKey]`, `beTradesByMode[mode][entry][beKey]`, `primaryVariant`.

---

## 2. Current architecture problem

There are **two unrelated resolution systems** that never meet:

**(A) The Trade Universe system (entry-variant axis).**
`state.scenario = { runId, family, threshold, fillMode, positionVariant, directionalStorageKey }` is the single canonical selector. `resolveTradeUniverse({ bundle, scenario })` turns it into a `canonicalKey` (`baseline`, `entry_triggered_edge_25p0_d2`, …) and calls `selectTrades(canonicalKey, …)` reading **`bundle.tradesByVariant`** and **`bundle.entryResults.tradesByMode`**. Almost every page already consumes this through `useTradeUniverse().trades` (Overview, RunDetail via `useRunVariant`, Failures, Session, News, OrderBlock, TradeInspector, Comparison). This axis has **no concept of break-even**.

**(B) The BE system (protection axis).**
BE trades live in a **parallel tree** the universe resolver never reads: `bundle.beResults[mode][entryVariantKey][beScenarioKey]` and `bundle.beTradesByMode[…]`. BreakevenTab resolves them directly via `resolveBeScenarioSource(...)` and renders them locally. `buildSelectiveBeUniverse(...)` produces a perfectly universe-shaped mixed list — **but it is consumed only inside BreakevenTab** and is never registered as a `sourceKey`.

Consequences:
- BE/Selective BE are trapped in one tab. Selecting "BE 1R Wick · CHoCH" cannot propagate to Strategy Map, Failures, Comparison, KPI cards.
- Parallel interpretation: the recently-audited bug (global "Trades affected" table disagreeing with the cohort) is a direct symptom — two code paths computing "BE-affected" with different scopes because there is no single selected universe.
- `state.scenario` has no field that can express "protected", so there is nowhere to record the selection even if a page wanted to read it.

The good news: the contract is already right. `selectTrades` is the only function that turns a key into trades, the universe object shape is stable, and the selective builder already returns that shape. Integration is **a new branch in the resolver + a new scenario field**, not a rewrite.

---

## 3. Recommended target architecture

A **derived protection-universe layer** that plugs into the existing resolver as a third `universeType`, selected by the same canonical `state.scenario`.

1. **Extend `state.scenario` with a `protection` slice** (null = no BE, current behaviour). When present it carries everything needed to re-derive the mixed universe deterministically:
   ```
   scenario.protection = {
     type: "break_even",
     beScenarioKey: "be_wick_1p00R",   // canonical BE key (beResolve)
     filters: { directions, structures, sessions, armLevels },  // [] = all-trades BE
   }
   ```
   The **entry variant it sits on is the existing `scenario` axis** (`family/threshold/fillMode` → `baseEntryVariantKey`). This is what guarantees variant integrity for free (§5.1).

2. **One new branch in `resolveTradeUniverse`.** After resolving the base entry universe (unchanged), if `scenario.protection` is set:
   - resolve BE trades for the **same** `(executionMode, baseEntryVariantKey, beScenarioKey)` via `findBeScenario` (EXACT only),
   - call `buildSelectiveBeUniverse({ originalTrades: <base universe trades>, beTrades, filters, scenario: { beScenarioKey } })`,
   - return a universe whose `trades` is the mixed list, with `universeType: "protected_result"`, a protected `sourceKey`/`label`, and the builder's `summary` copied into `metadata`.
   - On any failure (no BE data, variant mismatch, zero matches) → return the **base universe unchanged** plus a `warnings` entry (never silently fabricate BE).

3. **Everything downstream is unchanged** because they read `universe.trades`. No page needs to know BE exists; it just receives a different trade list and the same stats/label/warnings contract. Strategy Map's `useResolvedScenario` gets the same treatment (it shares the helpers), or — preferred — Strategy Map migrates its trade list to `useTradeUniverse` so there is literally one selector.

4. **Pure + non-destructive.** Raw imported trades and BE trades are never mutated; the mixed list is regenerated on demand from `state.scenario`. The selective builder is already pure and self-contained, so the resolver branch is the only new wiring.

This keeps a single selector (`state.scenario`), a single resolver (`resolveTradeUniverse`), and a single consumer contract (`universe.trades`) — the literal definition of "one source of truth" requested.

---

## 4. Proposed sourceKey / metadata shape

`universeType`: add **`"protected_result"`** alongside `"baseline"` / `"scenario"`.

**sourceKey** (deterministic, derived from base entry key + BE key + filters):
```
be_selective:{baseEntryVariantKey}:{beScenarioKey}:{filtersHash}
```
e.g. `be_selective:entry_triggered_edge_25p0_d2:be_wick_1p00R:dir-_str-choch_ses-_mfe-`
For the all-trades case (no filters) use a stable sentinel: `…:all`.
`filtersHash` is the serialized filter string from §D (readable, not a digest).

**label** (human, mirrors ScenarioSelector style):
```
BE 1R Wick · CHoCH + New York          (cohort)
BE 1R Wick · All Trades                (no filters)
```

**metadata** (carried on the universe object; numbers come straight from `buildSelectiveBeUniverse().summary`):
```
metadata: {
  baseEntryVariantKey,          // entry universe this BE sits on
  baseUniverseLabel,            // "Triggered Edge 25% · Arm C2"
  protectionType: "break_even",
  beScenarioKey,                // "be_wick_1p00R"
  triggerBasis, armLevelR,      // parsed from beScenarioKey (beResolve.parseBeScenarioKey)
  filters,                      // normalized { directions, structures, sessions, armLevels }
  filterLabel,                  // selectedFilterLabel(filters)
  appliedCount, matched, skippedMissingBe,
  lossesSaved, winnersCut, beExits,
  originalNetR, protectedNetR, deltaNetR,
  sampleSize, lowSample,        // exploratory guardrails
  exploratory: true,
}
```
The existing universe fields stay: `trades`, `stats = summarizeTradeSanity(mixed)`, `warnings`, `variant`, `baselineTrades`/`baselineStats` (baseline = the **base entry universe**, so Δ-vs-original stays meaningful), `canCompareToBaseline: true`.

---

## 5. UX recommendation

**Recommended: Option B first ("Open as Result View"), then graduate to Option A.**

Rationale: the BE tab is where the cohort is *configured* (chips, scenario, trigger). Forcing all permutations into the global ScenarioSelector up front would explode the picker (entry-variant × BE key × cohort filters). Let the BE tab stay the builder; add one promotion action.

Flow:
1. User configures Selective BE in the BE tab (existing chips + scenario + trigger).
2. Clicks **"Open as Result View"** → calls `setScenario({ …currentEntryScenario, protection: { type, beScenarioKey, filters } })`.
3. `state.scenario` now describes a protected universe; `useTradeUniverse` everywhere returns the mixed list.
4. A persistent banner/chip ("Result View: BE 1R Wick · CHoCH — exploratory · Clear") shows on every page, with a one-click **Clear** that sets `protection: null` (back to the entry universe). This reuses the existing research-banner components (`CurrentResultViewPanel`, `TradeUniverseBadge`).

Option A (protected views listed directly in `ScenarioSelector`) is the **end state** — once promotion works, the selector can show a "Protection" row listing the *active* protected view (and later, saved ones from P4). Option C (preview-only) is rejected as the primary home; the whole point is repeatable cross-page research.

---

## 6. Page impact analysis

| Page | Works if `universe.trades` is synthetic? | Needs label/source metadata? | Needs exploratory warning? | Needs original-vs-protected access? |
|---|---|---|---|---|
| **RunDetail** | Yes — already consumes `useRunVariant().universe.trades`; KPI strip uses `universe.stats`. | Yes — show protected label in the Result View header; `setResultView` must learn the protection slice. | Yes — banner. | Optional — Δ already via `baselineStats`. |
| **Strategy Map** | Mostly — but it uses `useResolvedScenario` for chart/OB overlays, which does NOT know protection. Trade list/markers would need the protected trades; OB enrichment keys off trade outcome so BE_EXIT rows must map to a colorKey. | Yes — UniverseBadge already shows universe/source; add protected branch. | Yes. | Per-trade `protectionApplied`/`deltaR` already on rows for tooltips. |
| **Protection Lab / BreakevenTab** | Yes — it is the producer. After promotion it should READ the active protected universe instead of (or in addition to) its local build, so the global "affected" table and the cohort agree. | Yes. | It is the exploratory surface already. | Yes — it owns this. |
| **Failures Lab** | Yes — `FailuresWorkspace` already uses `useTradeUniverse().trades`. Failure classification must tolerate `outcome: "BE_EXIT"` (verify it's in the outcome maps). | Yes — header label. | Yes — strongly (failure mining on a cohort-filtered protected set is the highest p-hacking risk). | Helpful — distinguish "failed under BE" vs original. |
| **Comparison Lab** | Yes — calls `getTradeUniverse(runId, effectiveScenario)` per run; a protected scenario flows through unchanged. | Yes — column label per run. | Yes — and guard against comparing a protected view on a run that lacks that BE scenario (resolver returns base + warning). | Yes — comparing protected vs base is a primary use. |
| **Overview / News / OrderBlock / TradeInspector / Session** | Yes — all read `universe.trades`. Lowest risk. | Label only. | Banner inherited. | No. |

Cross-cutting: `summarizeTradeSanity` / `classifyTrade` / `isWinTrade` must treat a BE-stopped row correctly (its realized R is the BE exit R, sign-correct already). Confirm the `BE_EXIT` outcome normalization (done in earlier phases) is honoured by every classifier the pages use.

---

## 7. Risks

1. **p-hacking (HIGH).** Entry-variant × BE key × cohort filters is an enormous search space; a "best" protected view will overfit. Mitigations: keep `exploratory: true` in metadata; show `sampleSize`/`appliedCount` and `deltaNetR` vs the **base entry universe** (marginal BE effect, not vs raw baseline) everywhere the view is used; banner on every page; require a min sample before any verdict language; never let a protected view be saved as "truth" (§E.6).
2. **Strategy Map dual resolver (HIGH).** Two resolvers (`useResolvedScenario` vs `useTradeUniverse`) is the existing fault line. If protection is added to only one, the map and the labs disagree again. Mitigation: route the map's trade list through the same protected branch, or migrate it to `useTradeUniverse`.
3. **Variant integrity (MED).** A protected view must use BE trades from the *same* entry variant. `findBeScenario` already enforces EXACT entry match with no baseline fallback — reuse it; never substitute baseline BE for a variant view.
4. **Missing/zero data (MED).** BE scenario absent for the selected entry variant, or filters match zero trades → must degrade to the base universe + explicit warning, not an empty or fabricated list.
5. **OB / chart colorKey (MED).** Strategy Map colors OBs from trade outcome; `BE_EXIT` rows need a defined colorKey or they render stale/wrong.
6. **Stable memoization (MED).** `useTradeUniverse` memoizes on `scenarioOverride` identity; the `protection` object must be referentially stable (serialize → reuse) or every render rebuilds the mixed universe. ComparisonLab/Overview already solved this with frozen override constants — follow that pattern.
7. **Persistence of a derived view (LOW-MED).** Persisting `scenario.protection` to `LS_SCENARIO` means a refresh re-derives BE; fine as long as the resolver tolerates a run whose BE data is index-only/not in memory (degrade + warn).

---

## 8. Implementation plan (phased; not yet built)

**P1 — Resolver + serialization (no UI).**
- Add `scenario.protection` to `DEFAULT_SCENARIO` + `loadPersistedScenario` (default null; fully back-compat).
- Add `serializeBeFilters` / `parseBeFilters` + `buildProtectedSourceKey` to `tradeUniverse.js` (§D).
- Add the `protected_result` branch to `resolveTradeUniverse` (resolve base entry universe → `findBeScenario` EXACT → `buildSelectiveBeUniverse` → universe-shaped return with metadata; degrade + warn on miss).
- **Validation only:** `protectedUniverse.validate.mjs` — sourceKey determinism, all-trades vs cohort, variant-mismatch → base+warning, zero-match → base+warning, delta vs base, no mutation, label formatting. No page consumes it yet.

**P2 — Promotion + first consumers.**
- BreakevenTab "Open as Result View" → `setScenario({ protection })`; "Clear" → `protection: null`.
- ScenarioSelector / research banner display the active protected label + exploratory chip.
- RunDetail (`useRunVariant`/`setResultView` learns the protection slice) and Strategy Map consume it (resolve the dual-resolver risk here).

**P3 — Labs + guardrails.**
- Failures Lab + Comparison Lab support protected universes with explicit exploratory warnings and min-sample gating; verify `BE_EXIT` classification across all KPI/failure paths.

**P4 — Named saved scenarios (later).**
- Allow saving a protected view (name + sourceKey + metadata) into the project, clearly tagged exploratory, with an explicit barrier preventing it from being treated as a verified result.

### Verdict
The universe contract is already the right abstraction and most pages already consume it. BE/Selective BE are isolated only because (a) `state.scenario` has no protection field and (b) `resolveTradeUniverse` never reads the parallel `beTradesByMode` tree. The fix is additive: one scenario slice, one resolver branch reusing the existing pure `findBeScenario` + `buildSelectiveBeUniverse`, then promote from the BE tab. The dominant risks are p-hacking (manage via exploratory labelling + sample/Δ-vs-base everywhere) and the Strategy Map dual-resolver split (must be unified or both branches patched). Recommend proceeding to **P1 (resolver + validation, no UI)** on confirmation.
