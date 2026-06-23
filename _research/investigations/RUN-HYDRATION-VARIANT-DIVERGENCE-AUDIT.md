# Run Hydration / Variant-Index Divergence — Audit

**Repo:** FX-OB-Research-Lab. **Audit only — no fixes.** Do NOT enable `ENABLE_LAZY_IMPORT`; do NOT rework the
importer; do NOT touch backend. This is a frontend hydration / resident-index issue.

## One root-cause theory (explains all 6 symptoms)

A persisted lazy/large run is restored by **`indexEntryToRun`** (`store.js:565-665`) as a **half-populated
shell**:
- **metadata present:** `summary` (incl. row count ~222), and `entryResults.summary` **reconstructed from the
  persisted `entryVariantKeys`** (`entrySummaryFromKeys`, so the *names* TE 25% / C40 exist);
- **row collections EMPTY:** `entryResults.tradesByMode: {}`, `tradesByVariant: {}`,
  `protectionResults.tradesByMode: {}`, `trades: []`, no `entryScenarioIndex` / `beScenarioIndex`
  (those are **not persisted**), `tradesOmittedForStorage: true`;
- markers `lazy:true`, `indexOnly:true`, `hasFullData:false`, `storageMode:"index_only"`.

The rows + full indexes are only filled by **`reloadLazyRunFromManifest`** (via `reloadFullRunFromSidecar`).
Today's `store.js` changes mean that **never runs for the shell**, yet **`runHasPopulatedData(lazy)→true`**
(`store.js:821`) reports the shell as **loaded** ("Available"). So:

> **Pages that read the persisted METADATA show the full variant universe and counts; pages that read the
> resident ROW collections see nothing — and nothing rehydrates the shell because it is mis-classified as
> populated.**

| Symptom | Reads metadata (works) | Reads rows (empty) |
|---|---|---|
| RunDetail shows TE 25% C40 | `entryResults.summary` / `entryVariantKeys` | — |
| Entries Lab "baseline only" | — | `Object.keys(tradesByMode)` |
| "Available / 222 rows" but 0 valid | summary row count + `runHasPopulatedData` | resolved `displayTrades` (valid/equity) |
| large-run import inconsistent | — | rehydration missing |
| some runs work, some don't | small/eager runs keep rows resident | large/lazy → shell |
| appeared after store/lazy changes | — | rehydration trigger removed |

---

## Shared-field map — broken (lazy shell) vs working (eager run)

| field | lazy shell (broken) | eager/hydrated (working) | who relies on it |
|---|---|---|---|
| `lazy` | **true** | false | BreakevenTab guard, isLazyRun |
| `largeRun` | undefined (not persisted) | false | guards |
| `indexOnly` | **true** (indexEntryToRun) | false | isIndexOnlyRun |
| `hasFullData` | **false** | true | hasFullRunData, autoReload |
| `storageMode` | `"index_only"` | `"memory_full"` | autoReload, classifiers |
| `entryScenarioIndex` | **missing** | resident | lazy row loaders, beExactCoverage |
| `beScenarioIndex` | **missing** | resident | BE coverage |
| `entryResults.summary` | **present (keys only)** | full | RunDetail selector, ExperimentCompare |
| `entryResults.tradesByMode` | **{} empty** | populated | **Entries Lab variant list**, KPIs |
| `tradesByVariant` (`availableVariants`) | **{} empty** | populated | availableVariants() |
| `entryVariantKeys` | **present** (persisted) | derived | RunDetail / resolver |
| `protectionResults.tradesByMode` | **{} empty** | populated | Protection Lab |
| `summary` / `headlineSummary` | present (rows≈222) | full | status badge, counts |
| reload IDs (`sidecarRunId`, `outputFolder`, …) | present | present | reload |
| `runHasPopulatedData()` | **true** ← misclassification | true | "Available", reload gating |

---

## Per-page derivation (where metadata diverges)

**A) RunDetail** — variant selector resolves through `useRunVariant → useTradeUniverse → getTradeUniverse`,
which lists entry variants from **`entryResults.summary` keys** (populated from persisted `entryVariantKeys`).
So it shows **TE 25% C40** even on an un-hydrated shell. Its own `entryScenarioKeys =
Object.keys(entryResults.tradesByMode)` (`RunDetail.jsx:822`) is a *separate*, secondary check. RunDetail
intentionally renders index-only runs (`:543-547` "we no longer require loaded rows") — expecting rehydration
to fill them. **It uses a fallback (summary keys) the other pages do not.**

**B) Entries Lab** — `EntriesWorkspace.jsx:92` builds `availableModelKeys` from **`Object.keys(tradesByMode)`**
(resident rows), not from `summary`. Shell `tradesByMode={}` → empty → `:201`
**"Baseline only — no entry-model variants in this run."** Same run, different field → opposite answer.

**C) KPI / equity** — `RunDetail.jsx:673-678`: `totalTradeRows = displayTrades.length`,
`validTradesForRun`/`validNetR` computed over the resolved universe trades. Shell → `displayTrades` empty →
**0 valid / N/A / empty equity**, while the "Available / 222 rows" badge reads persisted `summary` +
`runHasPopulatedData`. The **222 → 0 gap is metadata-count vs resident-rows**, not outcome/funding filtering.

**D) Hydration** — persisted (IndexedDB/localStorage) restores **only** `buildRunIndexEntry` fields
(`store.js:536-562`: summary, `lazy`, `entryVariantKeys`, reload IDs). Missing until
`reloadLazyRunFromManifest` runs: `entryScenarioIndex`, `beScenarioIndex`, `candlesMeta`, and all
`tradesByMode`/`tradesByVariant` rows (rows then stream via `ensureVariantTrades`/`useLazyEntryVariant`).
**Triggers that call it:** `reloadFullRunFromSidecar` (`:2695` already-lazy, `:2718` 413) — reachable from the
Runs **Reload** button, StrategyMap, and (historically) `autoReloadIndexedRunsFromSidecar`. **Pages that do
NOT trigger it for a lazy shell:** RunDetail (`shouldAutoReloadRun` requires `!isLazyRun`), Entries Lab,
Protection Lab, KPI cards — they assume the run is already hydrated.

**E) Recent regression (uncommitted `store.js`)** — confirmed cause of the *no-trigger* state:
`autoReloadIndexedRunsFromSidecar` now `if (run.lazy) return false` (skips lazy); `reloadLazyRunFromManifest`
sets `indexOnly:false`; `runHasPopulatedData` returns true for `lazy`. Together they make every consumer treat
the un-hydrated lazy shell as **fully loaded**, so the manifest rehydration never fires — leaving the row
collections empty while the metadata says otherwise. **Yes — these changes caused pages to treat an
unhydrated lazy shell as loaded.**

---

## Exact divergence point
`store.js` `indexEntryToRun` (`:565-665`) produces *metadata-rich, row-empty* shells; consumers split on
**`entryResults.summary` (metadata)** vs **`tradesByMode`/`displayTrades` (rows)**:
- RunDetail selector → `summary`/`entryVariantKeys` (shows variants);
- `EntriesWorkspace.jsx:92` + KPI `RunDetail.jsx:673` → `tradesByMode`/`displayTrades` (empty).
The reconciler (rehydration) that would make them agree is gated off by the E) changes.

---

## Fix recommendation: **3 — both** (rehydration primary, normalization secondary)

1. **Restore targeted lazy-shell rehydration (necessary — fixes 0-valid, empty equity, missing rows):** when a
   `lazy` run lacks resident indexes/rows (`!entryScenarioIndex?.length && !Object.keys(tradesByMode).length`),
   trigger `reloadLazyRunFromManifest` **once** (guarded by `AUTO_RELOAD_SESSION_ATTEMPTS`). Cleanest spot:
   relax the `autoReloadIndexedRunsFromSidecar` lazy-skip to *"skip only already-rehydrated lazy runs"*, and/or
   let `RunDetail.shouldAutoReloadRun` fire for an un-hydrated lazy run. Keep `ENABLE_LAZY_IMPORT=false`.
2. **Normalize page variant resolution (defensive — fixes the "baseline only" mismatch + false "loaded"):**
   make Entries Lab (and any `tradesByMode`-gated page) fall back to `entryResults.summary` /
   `entryVariantKeys` for the variant LIST (so it matches RunDetail), and make `runHasPopulatedData` /the
   status badge distinguish "metadata-only lazy shell" from "rows resident" so a shell isn't shown as a
   populated, 0-valid run.

#1 alone restores correctness once rehydration runs; #2 prevents the misleading half-states and keeps pages
consistent during the load window. Recommend both; #1 is the blocker.

*Audit only. No code changed, nothing staged/committed/pushed.*
