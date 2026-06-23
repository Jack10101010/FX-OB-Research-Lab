# Guarded Large-Run Path — Today's Regression (corrected audit)

**Repos:** FX-OB-Research-Lab (frontend) + Lux-OB-Backtester (sidecar). **Audit only — no fixes.**
**Do NOT set `ENABLE_LAZY_IMPORT = true`.** The regression is in the *guarded* path, not the old global one.

## Two different "lazy" systems — keep them straight

| | **Old global LazyRun** | **Guarded large-run fallback** |
|---|---|---|
| Entry point | `ingestRunBundle` size-threshold → index-only import | `reloadFullRunFromSidecar` 413 → `reloadLazyRunFromManifest` |
| Switch | `ENABLE_LAZY_IMPORT` (`importer.js:1177`) = **false** | none — runtime, flag-independent |
| When | at import time, for any big local bundle | when `/bundle` 413s (>25 MB) or a run is already `lazy` |
| Identity-bug risk | **High** (the reason it was disabled) | **Low** — manifest carries `run_id`; `reconcileRunIdentityFromSidecar` |
| Status | correctly **OFF** — leave it | **regressed today** |

The fix must restore the **guarded** path's behaviour without touching `ENABLE_LAZY_IMPORT`.

---

## The regression (exact cause)

A persisted/large run is stored as a **lightweight index entry only** — `buildRunIndexEntry`
(`store.js:536-562`) persists `hasFullData:false`, `storageMode:"index_only"`, `lazy`, `entryVariantKeys`,
and reload identifiers — **not** the resident `entryScenarioIndex` / `beScenarioIndex` / rows. So a lazy run
**must be rehydrated by `reloadLazyRunFromManifest`** every time it is sourced from the index (after refresh,
or any time it isn't still fully resident in memory).

`reloadLazyRunFromManifest` is only reachable via `reloadFullRunFromSidecar` (`store.js:2695` already-lazy,
`:2718` 413 fallback). The triggers that call `reloadFullRunFromSidecar` automatically are:
- **`autoReloadIndexedRunsFromSidecar`** (run on Runs-page mount, `Runs.jsx:77`) — historically the rehydrator.
- **`RunDetail.shouldAutoReloadRun`** = `isIndexOnlyRun && !isLazyRun && reloadAvailable` (`RunDetail.jsx:634`)
  — **excludes lazy runs by design**.

**Today's uncommitted `store.js` change** (the storm-fix) broke the only remaining automatic rehydrator:
```diff
# autoReloadIndexedRunsFromSidecar filter (store.js ~2781)
+ if (run.lazy) return false;          // ← lazy runs are now SKIPPED by auto-reload
# reloadLazyRunFromManifest patch (store.js ~2613)
- indexOnly: true,                     // 845b365 (working)
+ indexOnly: false,                    // now
# runHasPopulatedData (store.js ~821)
+ if (run.lazy) return true;           // lazy treated as fully populated
```
Net effect after a refresh / re-navigation:
- a persisted lazy run comes back as `lazy:true, indexOnly:false, hasFullData:false`, **no resident indexes**;
- `autoReloadIndexedRunsFromSidecar` **skips it** (`if (run.lazy) return false`);
- `RunDetail.shouldAutoReloadRun` **skips it** (`!isLazyRun` is false);
- `runHasPopulatedData(run)` returns **true**, so no "index-only / reload" UI nudges it either.

⇒ **The lazy run is never rehydrated from its manifest. It looks "loaded" but has empty variant/BE indexes and
no rows.** The user's only recovery is the manual **Reload** button (`Runs.jsx:142`) or **Settings → Import**
— and manual import eager-parses (`ENABLE_LAZY_IMPORT=false`) the ~153 MB candles + CSVs synchronously →
**"Page Unresponsive."** That is both reported symptoms from one change.

**Why before today it worked:** `845b365` set lazy runs `indexOnly:true` and **did not** skip them in
auto-reload, so on Runs-page mount `autoReloadIndexedRunsFromSidecar` rehydrated each lazy run once
(`AUTO_RELOAD_SESSION_ATTEMPTS` bounds it to one attempt/run). The storm-fix removed that without providing a
replacement trigger.

**Why "Lazy: Large run chip appears on some runs but not this one":** a run still resident from its *first*
lazy load this session shows the chip + data; the *same* run sourced from the persisted index after refresh
is an un-rehydrated shell — same `lazy` flag, different actual state.

---

## A–E path status

- **A) old global `ENABLE_LAZY_IMPORT`** (`importer.js:1177`, gate `:1356`): **inactive (false)**. Used only at
  import time if flipped on. Old LazyRun. High identity-bug risk → **correctly OFF, leave it.**
- **B) guarded 413 fallback** (`store.js` `reloadFullRunFromSidecar:2690` → `:2718`, `reloadLazyRunFromManifest`):
  **active**, used on open/reload of >25 MB or already-lazy runs. Guarded path, low identity risk. **This is what
  regressed** — its rehydration trigger was removed.
- **C) post-completion import/open:** `StrategyBuilder.onImportCompletedRun` (`:687`) fetches `/bundle` →
  **413 → catch → error, no fallback** (old-style; never had the guarded fallback). The working "direct open"
  actually went **index-entry → auto-reload → 413 → lazy**, i.e. via B — which is now broken.
- **D) manual Settings import:** `ImportZone` → `ingestRunBundle` on local files (bypasses the 25 MB server cap).
  With `ENABLE_LAZY_IMPORT=false` → **eager full parse → freeze**. Old path; unchanged but now the forced
  fallback.
- **E) RunDetail lazy chip/state:** `isLazyRun` / `isIndexOnlyRun` (`RunDetail.jsx:632-634`) + `LazyImportStatus`.
  Reads the `lazy`/`indexOnly`/populated markers that today's `store.js` changed, so classification now differs
  from what these committed consumers were written against.

---

## Recent-diff verdict (today only)
- Committed today: `3c58714` (SessionScenarioBuilder — unrelated), `15d7642`/`e9fe1c6` (BreakevenTab — Protection
  Lab only). **None touch import/open.**
- **Uncommitted `store.js`** (the storm-fix): autoReload `if (run.lazy) return false`; `reloadLazyRunFromManifest`
  `indexOnly:true→false`; `runHasPopulatedData` `lazy→true`; background OB load. **← the regression.**
- Uncommitted `sidecarClient.js` (candle params), `Runs.jsx` (copy-path button), sidecar `server.py`
  (`get_run_candles` aggregation): unrelated to import/open. Sidecar 413 cap (`server.py:34`,`690-696`) and
  manifest endpoint are **intact**.

So: a recent change **did** remove the auto-rehydration of lazy runs (auto-reload `lazy`-skip), **did** change
`run.lazy`/`largeRun` classification (`indexOnly`, `runHasPopulatedData`), and **did not** re-route imports
through the eager path — but it removed the trigger that kept the guarded path working across refreshes.

---

## Smallest safe fix (recommended — NOT implemented)
Keep `ENABLE_LAZY_IMPORT=false`. Keep the giant-cube old path disabled. Restore a **targeted** rehydration of
un-loaded lazy shells, without reintroducing the storm:
1. **Preferred:** in `autoReloadIndexedRunsFromSidecar`, replace the blanket `if (run.lazy) return false` with
   *"skip lazy runs that are already rehydrated"* — e.g. skip when
   `run.lazy && (run.entryScenarioIndex?.length || run.beScenarioIndex?.length)`, but still reload a lazy run
   whose indexes are empty (once, guarded by `AUTO_RELOAD_SESSION_ATTEMPTS`). This rehydrates persisted lazy
   shells while leaving resident ones (and avoiding the storm).
2. **Or:** in `RunDetail`, allow `shouldAutoReloadRun` for a lazy run that is **not yet rehydrated**
   (`isLazyRun && !hasResidentIndexes && reloadAvailable`), calling `reloadLazyRunFromManifest` once.
3. Either way, leave `reloadLazyRunFromManifest`'s 413 routing and the sidecar cap as-is; avoid the manual
   eager `ingestRunBundle` of candles.csv by ensuring the guarded path rehydrates instead.

Both are a few lines, touch only the trigger condition, and do not re-enable global lazy import.

*Audit only. No code changed, nothing staged/committed/pushed.*
