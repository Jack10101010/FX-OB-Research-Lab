# Entries Lab — baseline + user-selected variants model (audit)

**Repo:** FX-OB-Research-Lab. **Audit only — no code changed, nothing staged/committed/pushed.**

Goal: render **Baseline · Edge Touch + only the variants the user selects**, with **no static
`PLANNED_ENTRY_MODES` rows by default**.

## TL;DR
The single source of the static planned rows is **one function**: `buildEntryResultRows` (entryAnalytics.js:303–325),
which does `PLANNED_ENTRY_MODES.flatMap(...)`. **Every downstream panel already iterates `exactRows` generically**
(group by `row.family`, filter `!isBaseline`, find by `row.mode`) — none of them hard-require the 25-mode set. So
the redesign is mostly: **change row construction** to `baseline + selected variants`, plus add **multi-select +
per-variant lazy load**. Downstream panels need little or no change.

---

## 1. Dependency map — every consumer of `exactRows` / `availableModelKeys` / `selectedModelKey`

`EntriesWorkspace` builds `exactRows` and `availableModelKeys` and passes `exactRows` + `selectedModelKey` into
every tab via `sharedProps`. Consumers:

| Consumer | Reads | Multi-row assumption | Behaviour under B (baseline + selected) |
|---|---|---|---|
| **`buildEntryResultRows`** (entryAnalytics.js:311) | `PLANNED_ENTRY_MODES` | **builds** the static set | **This is the only thing to replace.** |
| **ExactResultsPanel** (model/ExactResultsPanel.jsx:307) | `exactRows`, `selectedModelKey` | groups by `row.family` → `FamilySection`; `isBestNetRInFamily`; multi-family disclaimer; sort; CSV export | Works as-is — families derive from rows present. With baseline + few selected, fewer sections. |
| **ResultRow** (ExactResultsPanel.jsx:175) | `row.mode === selectedModelKey` | per-row highlight + click toggle | Unchanged. |
| **ModelKPIStrip** (model/ModelKPIStrip.jsx:65) | `exactRows`, `selectedModelKey` | picks selected/first-exact; sparkline over all exact `netR` | Works; sparkline sparser. |
| **EquityCurvePanel** (model/EquityCurvePanel.jsx:23) → `buildAllModelCurves(exactRows,…)` | `exactRows`, `tradesByMode` | multi-curve, per-mode checkboxes | Works — curves only for rows present. |
| **lifecycle funnel** — `lifecycleRow` in ModelAnalysis.jsx:143 → `TriggeredEdgeFunnelPanel` / `SameNextCandlePanel` / `CancelReasonPanel` | `exactRows`, `selectedModelKey` | scoped to the selected lifecycle row | Works — driven by selection, not the planned set. |
| **missed/avoided losers** — `fftByMode` (EntriesWorkspace.jsx:181) + `FftProtectionPanel`/`FftClassificationPanel` | `exactRows`, `controlTradesByScenario`, `tradesByMode` | per-row paired-control lookup | Works — iterates whatever rows exist. |
| **TradeDiffExplorer** (model/TradeDiffExplorer.jsx) | `selectedModelKey`, `tradesByMode` | uses the selected mode only | Works. |
| **TradeOffPanel / MaeAnalyticsPanel / DirectionPanel / SessionMatrixPanel** | `exactRows` × `tradesByMode` | per-model breakdown rows | Work — iterate present rows. |
| **SensitivityPanel** (model/SensitivityPanel.jsx:15) | `exactRows` filtered to **penetration** family | assumes the penetration **ladder** (10/25/50/75) is present | **Degrades**: empty/sparse unless the user selects penetration variants. Acceptable; consider hiding when <2 penetration rows. |
| **ParetoPanel** (model/ParetoPanel.jsx:20) | all exact rows (`fillPct` vs `expectancy`) | scatter — more points better | Works; sparse with few selected. |
| **DominanceMatrix** (model/DominanceMatrix.jsx:44) | all exact rows ranked across dims | needs ≥2 rows to be meaningful | Works; thin with few selected. |
| **RobustnessLab** (robustness/RobustnessLab.jsx:60) | `exactRows` non-baseline, `selectedModelKey` | per-model robustness scores | Works — scores only selected. |
| **best-model tags / family grouping** — `markHighlights` (entryAnalytics.js:430) sets `isBestNetRInFamily`; `buildExactSummary` (507) family aggregates | `exactRows` `.family` | "best within family" across present rows | Works — recomputed over present rows. |
| **EntryWorkspaceHeader** (shared/EntryWorkspaceHeader.jsx:52) | `exactRows` | `modelCount = exact non-baseline` | Works — shows selected count. |
| **PromotionDesk** (promotion/PromotionDesk.jsx:69) | `exactRows`; `PLANNED_ENTRY_MODES.find(mode)` for metadata | candidate rows = exact non-baseline; planned lookup for family label | Works — `PLANNED_ENTRY_MODES.find` returns `undefined` for deep arms → already falls back to `row.family`. |
| **EntryHypothesisLab** (hypothesis/EntryHypothesisLab.jsx:114,151) | `PLANNED_ENTRY_MODES` for the "linked mode" dropdown | static menu of modes | Independent of `exactRows`. Cosmetic; could swap the menu to discovered keys later. |
| **ExperimentCompare** (compare/ExperimentCompare.jsx) | **runs** (`getRunData`/`normalizeEntryRun`), not `exactRows` | cross-**run** comparison axis | **Unaffected** — different axis; ignores `exactRows`. |
| **`availableModelKeys`** (EntriesWorkspace.jsx:125) | derived from `exactRows[].mode` | feeds `useModelSelectionGuard` + banner counts | Becomes "baseline + selected" — guard logic still valid. |
| **`useModelSelectionGuard`** (shared/useEntryWorkspace.js:203) | `availableModelKeys`, `discoveredModelKeys`, `selectedModelKey` | auto-picks/repairs a single selection | Keep for the **highlight** key; semantics still hold. |

## 2. How much of the page assumes multiple static planned rows?

**Almost none.** The static set exists only at **construction** (`buildEntryResultRows`). Everything downstream
is **data-driven off the rows that happen to be present**: family sections, best-in-family, equity curves,
dominance, Pareto, KPI sparkline, header count, promotion candidates all `map`/`filter`/`find` over `exactRows`.
The only panels that *implicitly* expect a particular planned shape are **SensitivityPanel** (penetration ladder)
and, cosmetically, **EntryHypothesisLab**'s linked-mode dropdown. Neither breaks — they just thin out. This is why
B is far cheaper than it looks: the table was already "render whatever rows you're given."

## 3. How to represent selected variants

Two distinct concepts that already half-exist and should be kept separate:

- **Active scenario** = the store `resultView` / `universe.sourceKey` (one variant, drives lazy load + the
  selector display). Already wired (the §previous fix gates the appended row on this).
- **Highlight key** = `selectedModelKey` (single string, `LS_MODEL`
  `fxob_entries_workspace_model_selection_v1`) — which row is emphasised + scopes lifecycle/diff panels.
- **NEW: pinned set** = `selectedVariantKeys` (array of canonical keys) — the variants shown in the table.

**Recommendation:** single global array, filtered by the active run's `discoveredModelKeys` at render (a pinned key
absent from the current run simply doesn't render). Lower complexity than per-run maps and matches "pinned
comparison set" UX.

- **Storage:** new `useEntryWorkspace` state `selectedVariantKeys: string[]`, persisted to
  `fxob_entries_selected_variants_v1` (array of canonical keys, e.g. `["entry_triggered_edge_25p0_d40",
  "entry_triggered_edge_10p0_d50"]`).
- **Migration from old `selectedModelKey`:** on first load, if `selectedVariantKeys` is absent/empty and `LS_MODEL`
  holds a string key, seed `selectedVariantKeys = [thatKey]`. Keep `LS_MODEL`/`selectedModelKey` as the highlight
  key (no destructive migration). De-dup canonically (`canonicalEntryMode`).
- **Single vs multi:** go **multi** (array). A single-string model can't express "compare C40 and C50," which is
  the whole point of the redesign.

## 4. Recommended UX
- **Selector → "Add variant"**: picking an option **adds** its canonical key to `selectedVariantKeys` and triggers
  that one variant's CSV lazy load (one CSV per add). Keep the existing "set active scenario" behaviour so the
  added row is also the focused/highlighted one.
- **Remove**: an ✕ on each non-baseline row (or a chip list above the table) removes the key from
  `selectedVariantKeys`.
- **Table** = Baseline · Edge Touch + one row per pinned key (built by `entryRowForSelectedKey`), **no planned
  rows**.
- **No eager load**: never enumerate/load all 71; CSVs load only for pinned keys, only when added.
- **Auto-add active variant on open**: if `selectedVariantKeys` is empty and the store scenario is a discovered
  variant, seed it with that one (so RunDetail's active variant carries over and the page isn't empty).
- **Baseline-only run**: no discovered variants → selector renders nothing, table = baseline only (unchanged).

## 5. Safest implementation path — recommendation

**Recommend Option B, delivered in two phases** (Phase 1 is independently shippable and de-risks the table):

- **Option A (single)** — baseline + the one active variant. Lowest risk, but it's just the current behaviour
  minus planned rows; it can't compare two arms, so it doesn't meet the research goal.
- **Option B (multi)** — baseline + pinned array. The right target. Extra work is confined to: the pinned-state
  array, a multi-variant lazy loader, and the add/remove UX. Downstream panels are already row-driven.

**Phase 1 (low risk):** stop building planned rows — `exactRows = [baseline, …pinned.map(entryRowForSelectedKey)]`
with the pinned set seeded from the active scenario only (effectively single, but via the new code path). Validates
that every downstream panel behaves with a baseline+1 table.
**Phase 2 (the UX):** array state + add/remove chips + multi lazy-load.

## 6. Option B design

- **`selectedVariantKeys` state** in `useEntryWorkspace`: `string[]`, persisted to
  `fxob_entries_selected_variants_v1`; setter `setSelectedVariantKeys` with canonical de-dup; helpers
  `addVariantKey(key)` / `removeVariantKey(key)`. Migration seed from `LS_MODEL` as in §3.
- **Add/remove behaviour:** `EntryVariantSelector.onPick` → `addVariantKey(buildCanonicalKey(...))` **and**
  `setResultView(...)` (focus + lazy load) **and** `setSelectedModelKey(...)` (highlight). Row ✕ → `removeVariantKey`.
- **Default selection:** on open, effect seeds `selectedVariantKeys` from `universe.sourceKey`/`resultView` when
  empty and discovered (the §previous `scenarioKey` derivation, generalised).
- **Row building** in `EntriesWorkspace`:
  ```
  const exactRows = useMemo(() => {
      const baseline = baselineEntryRow(filteredTrades);
      const keys = selectedVariantKeys.filter(k => discoveredModelKeys.includes(k));
      const rows = keys.map(k => entryRowForSelectedKey(activeRun, k, baseline, ACTIVE_TRADE_VARIANT)).filter(Boolean);
      markHighlights(rows);                       // re-establish best-in-family over the selected set
      return [{ ...baselineRowShape, ...baseline }, ...rows];
  }, [filteredTrades, selectedVariantKeys, discoveredModelKeys, activeRun, ACTIVE_TRADE_VARIANT]);
  ```
  (Export/reuse `markHighlights` — currently internal to `buildEntryResultRows`.)
- **Multi lazy-load:** new hook `useLazyEntryVariants(runId, runData, selectedVariantKeys)` that, for each pinned
  key whose rows aren't resident, derives the variant's source file and calls the **already-exported**
  `ensureVariantTrades(runId, fileName)` (store.js:2244) — **no `store.js` edit needed**. Rows render immediately
  from summary metrics (or a `selectedPending` placeholder) and upgrade as each CSV lands. (Modelled on
  `useLazyEntryVariant`, data/useLazyRows.js:26.)
- **Downstream consume selected rows only:** automatic — they already read `exactRows`. Retire
  `buildEntryResultRows`/`PLANNED_ENTRY_MODES` from the row path (keep `PLANNED_ENTRY_MODES` only for the optional
  Hypotheses dropdown until that's reworked).

## 7. Exact files / functions to change

| File | Change |
|---|---|
| `shared/useEntryWorkspace.js` | add `selectedVariantKeys` state + `addVariantKey`/`removeVariantKey` + `LS` key + migration seed from `LS_MODEL`. |
| `EntriesWorkspace.jsx` | replace `plannedExactRows`/append logic with `baseline + selectedVariantKeys.map(entryRowForSelectedKey)`; wire add/remove; seed default from store scenario; pass `removeVariantKey` down. |
| `analytics/entryAnalytics.js` | **export** `markHighlights`; (optional) keep `buildEntryResultRows` but stop calling it. No change to `entryRowForSelectedKey`. |
| `data/useLazyRows.js` | add `useLazyEntryVariants` (loop `ensureVariantTrades` per pinned key). **No `store.js` change** (`ensureVariantTrades` already exported). |
| `shared/EntryVariantSelector.jsx` | "Add" semantics (call `addVariantKey`); optionally render pinned-chips with ✕. |
| `model/ExactResultsPanel.jsx` | optional: per-row ✕ remove control. |
| `model/SensitivityPanel.jsx` | optional: hide when <2 penetration rows (avoid empty panel). |
| `hypothesis/EntryHypothesisLab.jsx` | optional/cosmetic: source linked-mode menu from discovered keys instead of `PLANNED_ENTRY_MODES`. |
| **Do NOT touch** | `store.js`, `RunDetail.jsx`, backend, `PLANNED_ENTRY_MODES` contents, `ExperimentCompare` (cross-run axis). |

## 8. Risk assessment

- **Low:** the table is already row-driven, so family grouping / best-in-family / equity / KPIs / promotion need
  no logic change — only fewer rows. Phase 1 (baseline+1) exercises every panel with the new path before adding
  multi-select.
- **Medium:** `selectedVariantKeys` lifecycle across runs (stale keys from another run) — mitigated by filtering to
  `discoveredModelKeys` at render. Migration from `LS_MODEL` must be non-destructive (seed, don't move).
- **Medium:** multi lazy-load correctness — N concurrent `ensureVariantTrades`; must key effects on the pinned set
  and avoid duplicate fetches (track in-flight). Reuse `useLazyEntryVariant`'s no-op-when-resident guard.
- **Low/known degradations:** SensitivityPanel + DominanceMatrix thin out with few rows (expected by the redesign);
  Hypotheses dropdown still lists planned modes until reworked.
- **Behavioural change (intended):** eager runs that previously showed a full planned table now show baseline only
  until the user adds variants. No data loss — those modes are discoverable and addable.

## 9. Implementation plan
1. **Phase 1 — row path.** `useEntryWorkspace`: add `selectedVariantKeys` (+migration). `EntriesWorkspace`:
   `exactRows = baseline + selectedVariantKeys∩discovered → entryRowForSelectedKey`, seed default from store
   scenario, export/call `markHighlights`. Verify all ModelAnalysis panels with baseline+1. (No planned rows.)
2. **Phase 2 — multi-select UX.** `addVariantKey`/`removeVariantKey`; selector "Add"; pinned chips + row ✕;
   `useLazyEntryVariants` multi loader.
3. **Phase 3 — polish.** SensitivityPanel guard; optional Hypotheses dropdown from discovered keys; banner copy
   ("Comparing N selected variants vs baseline").
4. Build check (esbuild parse/bundle) + logic traces per phase. No commit/push.

## 10. Validation plan
1. Open a 71-variant run → table shows **baseline only** (or baseline + auto-added active variant), **no planned
   rows**, **no 71 eager load** (network: 0–1 variant CSV).
2. Add **TE 25% · C40** → one CSV loads → row appears with real summary→rows metrics + Δ vs Baseline · Edge Touch.
3. Add **TE 10% · C50** → second CSV loads → both rows present; equity overlay/KPIs/dominance include exactly those
   two + baseline.
4. Downstream panels (lifecycle, FFT, robustness, Pareto) reflect only the selected variants.
5. Remove one variant → its row + curve disappear; **no duplicate rows**; one CSV per remaining variant only.
6. Switch active focus among pinned variants → highlight + lifecycle/diff follow `selectedModelKey`; rows persist.
7. Baseline-only run → no selector, table = baseline only, unchanged.
8. Reload page → `selectedVariantKeys` restored from localStorage; stale keys not in this run are filtered out.
9. esbuild parse/bundle clean.

*Audit only. No edits, nothing staged/committed/pushed.*
