# RUN-VARIANT-HEADER-PHASE-3-AUDIT-1

**Type:** audit only (NO implementation, no source changes)
**Owner:** Claude (UI/UX + system audit)
**Branch verified:** `codex-dev` · HEAD `7787b11 feat(run-detail): centralize result view header state`
**Date:** 2026-06-10
**Scope:** Assess Strategy Map + Hypothesis Lab adoption of the Phase 1–2
`useRunVariant` / `ResearchRunHeader`, and check for collision with the Master
Controls workstream. Audit only — no files edited.

**Cleanliness check:** `StrategyMap.jsx`, `HypothesisLab.jsx`, `useResolvedScenario.js`,
`ScenarioSelector.jsx`, `components/masterControls/*`, `configRegistry.js`,
`configTranslator.js` are all **clean** at HEAD. Phase 1–2 (`store.js`, `RunDetail.jsx`,
`useRunVariant.js`, `runVariantResolve.js`, `ResearchRunHeader.jsx`) is committed.

> **Headline finding:** the deeper read revises the original
> `RUN-VARIANT-HEADER-AUDIT-1` assumption. Strategy Map and Hypothesis Lab are **already
> store-`scenario`-backed** — they were never part of the dual-source-of-truth bug (that
> was RunDetail-only, now fixed). So Phase 3 is **much smaller** than "roll
> `ResearchRunHeader` onto both pages." The only real correctness gap is **one line in
> Hypothesis Lab**. Strategy Map needs at most an optional label-dedup. Master Controls
> does **not** collide.

---

## §1 — Current state

### 1.1 There are three Result-View surfaces today (plus run identity)
| Surface | Type | Used by | Role |
|---|---|---|---|
| **`ResearchRunHeader`** (Phase 2) | interactive switcher | RunDetail | Full entry-model / threshold / fill-mode controls + "Current Result View". |
| **`ScenarioSelector`** (`pages/strategyMap/`) | interactive switcher | Strategy Map | Chart-specialized picker: family/threshold/**Arm C0–C3** pills, directional, `TradeSanityStrip`, Both-gating, viewing label. |
| **`TradeUniverseBadge`** (`components/lab/`) | **read-only** status chip | HypothesisLab, FailuresWorkspace, TradeInspector, NewsLab, OrderBlockLab | Universe / Model / Variant / Source / Rows + the user-facing warning chips (incl. the Arm C0/C1 double-count). |
| **`LabRunHero`** (`components/lab/`) | run identity | RunDetail, StrategyMap, HypothesisLab | "Which run" hero — already shared across all three. |

So run identity is already shared (`LabRunHero`), and the **read-only** Result-View
status chip is already shared (`TradeUniverseBadge`, explicitly built to kill 5 copy-paste
copies). Only the **interactive switcher** exists in two forms (`ResearchRunHeader` vs the
chart-specialized `ScenarioSelector`).

### 1.2 Strategy Map — how it reads scenario / Result View (Goal 1)
- Reads `SCENARIO` from the store (`useDataset`, L155).
- **Already seeds the store** on mount/run-switch with the config-intent-aware default:
  `derivedPrimaryScenario = derivePrimaryResultView(bundle)` (L307-310) → `setScenario({ runId, ...derivedPrimaryScenario })` behind a `shouldSeed` guard (`!SCENARIO.runId || SCENARIO.runId !== runId || !SCENARIO.family`, L317-326). This is the **same derive + same guard** that `useRunVariant`/`runVariantResolve` use — so **Strategy Map and RunDetail already agree on the default Result View.**
- All chart/OB/overlay/stats data flows from `useResolvedScenario(SCENARIO, bundle, {…})` (L331-339), which calls the shared `tradeUniverse` pure functions (`resolveHierarchy`, `selectTrades`, `buildAvailableOptions`).
- Still passes a `legacyEntryModelHint: selectedEntryModel` (the old per-run `selectedEntryModelByRun` dropdown) as a Phase-2 bridge for when scenario fields are null.
- Writes Result-View changes via `setScenario` (ScenarioSelector `onScenarioChange`) and position-variant via `setScenario({ positionVariant })` + `setSelectedTradeVariant` (L774-783).

**Net:** Strategy Map is already a correct single-source-of-truth consumer/producer of the
store scenario. It does **not** have RunDetail's old local-fork problem.

### 1.3 Duplicated ScenarioSelector / Arm C0/C1 logic that could be removed (Goal 2)
The fill-mode → "Arm C0/C1/C2/C3" mapping is implemented **three** times:
1. `data/tradeUniverse.js` `describeUniverseLabel` (`same`→"Arm C0", `next`→"Arm C1", `dN`→"Arm CN") — the canonical one.
2. `pages/StrategyMap.jsx` L1187-1189 (inline in a label helper).
3. `pages/strategyMap/ScenarioSelector.jsx` `fillModeDisplayLabel` L84-90.

(`ResearchRunHeader` does **not** duplicate it — it labels the same values "Same candle /
Next candle / Delay +2/+3", see §1.5 terminology note.)

The dedup target is small: extract a single pure `fillModeArmLabel(fm)` helper and have #2
and #3 consume it. **This is maintenance, not correctness** — all three already produce the
same strings. The double-count gating in `ScenarioSelector` (Both pill hidden on
`hasCombinedFillMode === false`, tooltip *"Arm C0 and Arm C1 were exported as separate CSVs;
merging them would double-count each OB."*) must be left untouched.

### 1.4 Hypothesis Lab — how it defaults to baseline, and where it should use the store Result View (Goal 3)
- `const universe = useTradeUniverse();` (L104) — **no args**, so it resolves the **active run** against the **raw store `scenario`**. When the store scenario is unset (`family: null`, the `DEFAULT_SCENARIO`), `resolveTradeUniverse` treats it as **baseline** — Hypothesis Lab never applies `derivePrimaryResultView`. → **This is the one real baseline-default bug.** (If the user already set a scenario on RunDetail/StrategyMap, it propagates here correctly — the bug only bites on a cold load where no page has seeded the scenario yet.)
- `selectedEntry` / `selectedProtection` default to `"baseline"` (L113-114) — these are **NOT** the Result View. They are the page's **in-page what-if simulator** picking from the bundle's `exactEntryRows`/`exactProtRows` summary blocks (L131-139), which the file's own comment (L100-103) says are built "regardless of scenario, and that's correct." **Do not touch these.**
- Hypothesis Lab **already renders `<TradeUniverseBadge universe={universe} …/>`** (L255), so it already displays the active Result View + the double-count warning, read-only.

**Fix location:** swap `useTradeUniverse()` → `useRunVariant(activeRunId)` and read
`.universe` from it. That routes the default through `derivePrimaryResultView` and keeps
store propagation — without any new UI. It is read-only (the hook only writes on
`setResultView`, which Hypothesis Lab won't call).

### 1.5 Terminology nuance to resolve (does not block Phase 3)
`ScenarioSelector` frames fill mode as **"Arm timing" (Arm C0/C1/C2/C3)** with a tooltip that
explicitly distinguishes arm timing from fill timing (*"A trade can Arm C0 but still fill on a
later candle"*). `ResearchRunHeader` labels the **same underlying `fillMode` keys** as **"Same
candle / Next candle / Delay +N" (Fill Mode)**. This is a pre-existing cross-page labeling
inconsistency, not introduced here. Recommendation (per AUDIT-1 §7): if/when unifying, pair
both — e.g. *"Same Candle (Arm C0)"* — but keep the lens name **"Result View"** and the arm
tooltip's domain text. **Out of scope for Phase 3; flag for a terminology decision.**

---

## §2 — Master Controls collision / overlap assessment (Goals 6 & 7)

**No collision.** Master Controls operates on a **different, orthogonal axis** and never owns
or writes the Result View:

- `MasterControlsContext.jsx` reads `activeRunId` from `useDataset` but **never calls `setScenario`** and **does not own a Result View**. Its 4 "scenario" string hits are comments ("swaps the triggered-edge scenarios", run-switch reset note, "no covered scenario" for FFT preview) — not Result-View state.
- What MC actually owns is the **Preview Lens**: a temporary, app-wide **cost / RR / filter / FFT rescore** overlay (`previewLens`, `localRescoreBundle`, `localRrBundle`, `localFilterBundle`, `localFftBundle`, `applyComposedPreviewLens`, `exitPreviewLens`) surfaced by `GlobalPreviewBanner`. This is the "TradingView-style instant update / shared controls" work — it rescores **whatever trades are currently shown**, without saving.
- The rescore engines (`costRescore.js`, `rrRescore.js`, `previewComposer.js`, `tradeFilter.js`, `bundleWalk.js`) operate on **passed-in bundles/trades**, not on the store scenario.
- `configRegistry.js` / `configTranslator.js` are the **config-authoring** layer (translate UI config → backtest params: `entry_mode`, TE thresholds, etc.). They describe "what to run," not "what to view." Orthogonal to the Result View selector.

**The two axes compose, they don't compete:**

```
                 Result View (scenario)              Preview Lens (Master Controls)
 owns            store.scenario                      MasterControlsContext.previewLens
 chooses         which exported variant/CSV          temporary cost/RR/filter/FFT rescore
 surfaced by     ResearchRunHeader / ScenarioSelector / TradeUniverseBadge
                                                     GlobalPreviewBanner
 writes via      setScenario (useRunVariant)         applyComposedPreviewLens / exitPreviewLens
 persistence     localStorage (fxob_scenario_v1)     in-context only (never persisted)
 data path       resolveTradeUniverse → universe.trades  → (then) rescore overlay on those trades
```

A page can correctly show **both** a `ResearchRunHeader` ("Triggered Edge 50% · Next") **and**
a `GlobalPreviewBanner` ("Temporary preview active — not saved"): pick the variant, then
preview a cost tweak on it. The Preview Lens sits **downstream** of the resolved universe, so
changing the Result View changes the base trades and the lens re-applies — no conflict, no
double-ownership.

---

## §3 — Ownership boundary recommendation

1. **`useRunVariant` + `store.scenario` own the Result View axis** (which variant/CSV). All interactive Result-View switching writes here. Single source of truth — already true after Phase 1–2.
2. **Master Controls owns the Preview Lens axis** (temporary rescore overlay). It must remain free to rescore the resolved universe without knowing how the variant was chosen. Do not route Preview-Lens state through `useRunVariant`, and do not let `ResearchRunHeader` read or write `previewLens`.
3. **`TradeUniverseBadge` stays the shared read-only Result-View status chip**; **`ResearchRunHeader` is the shared interactive switcher**; **`ScenarioSelector` stays the chart-specialized switcher** for Strategy Map. Three roles, kept distinct.
4. **Keep `ResearchRunHeader` separate from Master Controls** (Goal 7). They are different axes with different lifecycles (persisted vs ephemeral) and different visual languages (accent "active lens" vs amber "unsaved preview"). A future "research cockpit" could *stack* them (identity → Result View → Preview banner) but should **not merge** them into one control. No integration in Phase 3.

---

## §4 — full vs compact `ResearchRunHeader` per page (Goal 4)

| Page | Recommendation | Why |
|---|---|---|
| **RunDetail** | **Full** (already shipped) | The cockpit; owns account/basis scope chips + parity audit. |
| **Strategy Map** | **Neither — keep `ScenarioSelector`** | Already store-backed; `ScenarioSelector` is chart-coupled (TradeSanityStrip, arm-timing semantics, decomposed hook props). Swapping it in adds high risk for no correctness gain and would *lose* the arm-timing framing. |
| **Hypothesis Lab** | **Neither — keep `TradeUniverseBadge` (read-only)** | It already shows the Result View + double-count warning. The page is a what-if simulator; users switch the Result View on RunDetail/Strategy Map and it propagates. No interactive switcher needed here. |

**Consequence:** Phase 3 does **not** add a `compact` `ResearchRunHeader` variant — there is
no consumer for it yet (YAGNI). The `variant="full"|"compact"` idea from AUDIT-1 is deferred
until a page genuinely needs an interactive switcher *without* RunDetail's scope chips.

---

## §5 — Data surfaces that must refresh when Result View changes (Goal 5)

Both pages already refresh correctly because everything derives from the store scenario:

**Strategy Map** (all via `useResolvedScenario` → recomputes on `SCENARIO` change): active
trades, enriched `chartObBoxes`, `chartTradeMarkers`, `rrTools`, `triggeredEdgeOverlays`,
`runStats`, the `ScenarioSelector` viewing label + Both-gating + `TradeSanityStrip`, and the
universe/source badge. (Directional family is handled by the explicit `isDirectionalMode`
bypass, L345-346 — preserve it.)

**Hypothesis Lab** (all derive from `universe.trades`): `baseline` stats, `exactEntryRows`,
`insights`, `filteredTrades` / `simStats`, the simulator delta rows, and the
`TradeUniverseBadge`. After the fix, these recompute against the *primary* Result View on a
cold load instead of baseline. (The `selectedEntry`/`selectedProtection` simulator overrides
stay independent — they must **not** reset when the Result View changes.)

---

## §6 — Exact files to change

**HL fix (correctness — recommended):**
- `frontend/src/pages/HypothesisLab.jsx` — replace `useTradeUniverse()` with `useRunVariant(activeRunId)`; read `universe` from it. Add the import; drop the now-unused `useTradeUniverse` import if nothing else uses it. **No other change** (leave `selectedEntry`/`selectedProtection`, `TradeUniverseBadge`, `LabRunHero` as-is).

**Strategy Map label dedup (optional maintenance):**
- `frontend/src/pages/StrategyMap.jsx` — replace inline L1187-1189 with the shared `fillModeArmLabel`.
- `frontend/src/pages/strategyMap/ScenarioSelector.jsx` — replace `fillModeDisplayLabel` body (L84-90) with the shared helper.
- Helper home (pick one; pure, additive, **no selection-semantics change**): preferred = a new tiny `frontend/src/data/resultViewLabels.js` exporting `fillModeArmLabel`; alternative = export it from `tradeUniverse.js` (already contains the canonical mapping in `describeUniverseLabel`). Avoid `entryFormatters.js` (Entry/FFT-owned).

**Not touched (per scope):** ProtectionLab, FailuresLab, SessionLab, importer, all
`masterControls/*`, `configRegistry.js`, `configTranslator.js`, `tradeUniverse.js` selection
semantics, `useResolvedScenario.js` resolution logic.

---

## §7 — Recommended implementation plan

**Step 1 (correctness) — Hypothesis Lab uses the store Result View.**
Swap the resolver to `useRunVariant(activeRunId)`. Verify a cold-load triggered-edge/penetration
run now shows the primary Result View (not Baseline) in the badge, KPIs, and simulator base.

**Step 2 (optional maintenance) — centralize the Arm label.**
Add `fillModeArmLabel`, point Strategy Map + ScenarioSelector at it, delete the two local
copies. Pure-string refactor; zero behavior change. Can be deferred or dropped.

**Deliberately deferred:** replacing `ScenarioSelector` with `ResearchRunHeader`; a `compact`
header variant; removing the `legacyEntryModelHint` bridge; the Arm-vs-Fill terminology
reconciliation. None are required and each carries risk disproportionate to its value right now.

---

## §8 — Risks / blockers

| # | Risk | Mitigation |
|---|---|---|
| R1 | `useRunVariant(activeRunId)` subtly changes HL's trade set on cold load (baseline → primary). | That **is** the intended fix (req #5). Validate the delta is exactly "baseline → config-primary" and that an already-set scenario still propagates unchanged. |
| R2 | HL has no explicit `runId` prop — uses active run. | `useRunVariant(activeRunId)` mirrors `useTradeUniverse()`'s implicit active-run behavior; pass `activeRunId` from `useDataset` (already destructured, L105). |
| R3 | Arm-label dedup accidentally alters the double-count gating or the arm-timing tooltip. | Dedup is **string-label only**; do not touch `hasCombinedFillMode`, the Both-pill gate, or the tooltip text. Grep-confirm the warning string is byte-identical after. |
| R4 | Master Controls Preview Lens interaction. | None expected — orthogonal axis, downstream of the universe. Sanity-check: open a preview lens, switch Result View, confirm the lens re-applies to the new base trades and `GlobalPreviewBanner` still shows. |
| R5 | Shared multi-owner files. | HL fix is isolated to `HypothesisLab.jsx`. The dedup touches StrategyMap + ScenarioSelector (Strategy Map stream) — coordinate; both are clean at HEAD. Scoped commits, no `git add .`. |
| R6 | `legacyEntryModelHint` still feeds `useResolvedScenario`. | Leave it; it's a harmless bridge now that the store is always seeded. Removing it is a separate, riskier cleanup. |

**Blockers:** none. Soft decision needed: whether to do the optional Step 2 at all, and the
Arm-vs-Fill terminology call (can wait).

---

## §9 — Validation checklist

- [ ] Babel-transpile every edited file (`@babel/core` env+react presets); no full `craco build`.
- [ ] `grep -R "font-mono|tracking-widest" frontend/src --include=*.jsx` introduces **0** new hits in changed files.
- [ ] Existing validators still green: `node …/modelFamily.validate.mjs`, `node …/useRunVariant.validate.mjs`.
- [ ] **HL cold-load:** open a fresh triggered-edge run with no prior scenario → `TradeUniverseBadge`, baseline stats, and simulator base reflect the **primary** Result View, not Baseline.
- [ ] **HL propagation:** set a scenario on Strategy Map / RunDetail → Hypothesis Lab reflects the same Result View (and survives reload via `LS_SCENARIO`).
- [ ] **HL simulator independence:** changing `selectedEntry`/`selectedProtection` does not change the Result View, and switching the Result View does not reset the simulator selectors.
- [ ] **HL double-count:** a separate-CSV run still shows the Arm C0/C1 warning in the badge.
- [ ] **SM (if Step 2):** Arm C0/C1/C2/C3 labels render identically pre/post dedup; Both-pill gating + double-count tooltip unchanged; no console errors.
- [ ] **Master Controls coexistence:** Preview Lens active + Result-View switch → lens re-applies to new base trades; `GlobalPreviewBanner` unaffected.
- [ ] Dark theme unchanged; diff review confirms only the §6 files changed.

---

## §10 — One commit or split? (final question)

**Split into two independent commits** — they share no files and have different risk/value:

1. **`fix(hypothesis-lab): resolve result view via useRunVariant (no baseline default)`** — `HypothesisLab.jsx` only. The correctness fix; ship first, independently.
2. **`refactor(strategy-map): centralize Arm fill-mode label`** — `StrategyMap.jsx` + `ScenarioSelector.jsx` + the helper file. Optional maintenance; ship second (or defer/drop).

Splitting lets the Hypothesis Lab correctness fix land without waiting on the Strategy Map
stream or the Arm-vs-Fill terminology decision, and keeps each commit reviewable in isolation.

*End — RUN-VARIANT-HEADER-PHASE-3-AUDIT-1. Audit only; no source files were edited.*
