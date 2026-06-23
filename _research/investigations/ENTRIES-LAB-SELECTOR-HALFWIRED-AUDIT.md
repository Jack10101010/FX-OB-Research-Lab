# Entries Lab — selector half-wired (audit)

**Repo:** FX-OB-Research-Lab. **Audit only — no code.**

## Exact root cause
The selector correctly loads the chosen variant into the **store scenario** and into
`entryResults.tradesByMode[selectedKey]`, but the table pipeline (`exactRows`) is built by **enumerating the
static `PLANNED_ENTRY_MODES` list**, which does **not** contain deep/dynamic TE arms. So the selected variant
is never turned into a row — even though its summary metrics and (after load) its trade rows are present.

- `buildEntryResultRows` (`analytics/entryAnalytics.js:302-323`) does
  `PLANNED_ENTRY_MODES.flatMap(planned => …)` and only emits a row for a planned mode that matches the summary
  (`exactByMode.get(modeKey)`) or resident `tradesByMode`.
- `PLANNED_ENTRY_MODES` (`analytics/entryRegistry.js:214`) is a **static 25-entry list**: baseline, penetration
  10/25/50/75, TE **only `same`/`next`/`d2`/`d3`** (= arms C0–C3) at thresholds 10/25/50/75, plus a few future
  modes. It has **no** `entry_triggered_edge_25p0_d40` (and no 1%/5% thresholds, no arms C4–C50).
- `flattenEntrySummary` (`entryAnalytics.js:282`) **does** expose every summary key with metrics, so
  `exactByMode` already contains `entry_triggered_edge_25p0_d40` → real metrics — but `buildEntryResultRows`
  never calls `exactByMode.get("entry_triggered_edge_25p0_d40")` because that mode isn't iterated.
- `store.ensureVariantTrades` (`store.js:2239+`) merges the lazily-loaded CSV into
  `entryResults.tradesByMode[keys.mode]` (incl. the canonical key). So selecting → `useLazyEntryVariant` →
  `tradesByMode["entry_triggered_edge_25p0_d40"]` **is** populated. The injection works; the **enumeration**
  drops it.

So: **two parallel pipelines that don't meet.** The selector drives `setResultView` → `universe.trades` (global,
store-scenario) → chip "Rows loaded". The table reads `PLANNED_ENTRY_MODES ∩ (summary|tradesByMode)`, which
excludes the discovered key. The "Rows loaded" chip is truthful about `universe.trades`; it just isn't what the
table consumes.

## Selected key values at each stage (for "Triggered Edge 25% · Arm C40")
| stage | value |
|---|---|
| selector option | `key:"triggered_edge_25_d40"`, `family:"triggered_edge"`, `threshold:25`, `fillMode:"d40"` |
| `setResultView({family,threshold,fillMode})` | store scenario → `universe.sourceKey` ≈ `entry_triggered_edge_25p0_d40` |
| `useLazyEntryVariant` / `ensureVariantTrades` | loads 1 CSV → `entryResults.tradesByMode["entry_triggered_edge_25p0_d40"]` populated → chip **"Rows loaded"** (`universe.trades`) |
| `setSelectedModelKey` | `buildCanonicalKey("triggered_edge",25,"d40")` = `entry_triggered_edge_25p0_d40` |
| `flattenEntrySummary(summary)` | includes `{mode:"entry_triggered_edge_25p0_d40", net_r, wins, …}` → in `exactByMode` |
| `buildEntryResultRows` | iterates `PLANNED_ENTRY_MODES` → **no** `..._d40` planned → **no row** built |
| `ExactResultsPanel` | rows = planned subset only → C40 absent; `selectedModelKey` matches no `row.mode` → no highlight |

## Q3 answers (why "Rows loaded" but tables baseline-only)
- **Injecting into `tradesByMode[selectedModelKey]`?** Yes — `ensureVariantTrades` merges there. The data is
  present; it just isn't enumerated.
- **`selectedModelKey` ≠ ExactResultsPanel row key?** There is **no** row with that key, because
  `buildEntryResultRows` never builds one for a non-planned mode. (Keys themselves are canonical and would
  match if a row existed.)
- **Canonical mismatch?** No — `entry_triggered_edge_25p0_d40` is consistent across `setSelectedModelKey`,
  `tradesByMode`, and `flattenEntrySummary`.
- **`availableModelKeys` filtering it out?** `availableModelKeys` = `exactRows[].mode`; since no deep-arm row
  is built, the key isn't there (and the guard's discovered-union keeps the *selection* but cannot create a
  *row*). Enumeration, not filtering, is the blocker.

## Smallest safe fix — Option A: append ONE selected-variant row
Build a single row for the selected discovered key from data already resident, and append it to `exactRows`.
- **New helper** in `entryAnalytics.js`, e.g. `entryRowForSelectedKey(run, key, baseline, activeVariant)`:
  1. `src` = `flattenEntrySummary(entryResults.summary, activeVariant)` row whose `mode === key` (summary
     metrics, may be absent on a lazy shell);
  2. `modeTrades` = `tradesByMode[`${activeVariant}__${key}`] || tradesByMode[key]` (resident after load);
  3. derive a synthetic planned descriptor from the key — `family = familyFromKey(key)`,
     `threshold = extractThreshold(key)`, `fillMode = fillModeFromKey(key)`, label via the same
     "· Arm C{n}" convention (`armCandleIndex`) used by the selector / RunDetail;
  4. if `src || modeTrades?.length` → `entryRowFromSummary(syntheticPlanned, src || {}, baseline, modeTrades)`
     (reuses the existing builder; `deltaVsBaseline` vs the **edge-touch baseline** is computed there);
  5. else (no summary metrics AND no resident rows) → return a **"rows loading" placeholder** row (or omit) —
     **never a fabricated 0R row**.
- **`EntriesWorkspace.jsx`**: when `selectedModelKey` is a discovered key (`discoveredModelKeys.includes`) and
  not already in `exactRows`, append `entryRowForSelectedKey(...)` to the rows passed to `ModelAnalysis` /
  `ExactResultsPanel`, and add the key to `availableModelKeys` so it highlights/compares. One variant only.
- **Do NOT** touch `PLANNED_ENTRY_MODES`; **do NOT** iterate all 71 (only the selected key); **no** eager load.

Rejected alternatives: (B) replacing `PLANNED_ENTRY_MODES` with `discoveredModelKeys` in `buildEntryResultRows`
would list all 71 and lose the curated planned metadata/labels (violates "one variant / no eager"); (C) passing
the summary separately to `ExactResultsPanel` is more plumbing than appending one row.

## Files / functions to change (when implemented)
- `components/lab/entries/analytics/entryAnalytics.js` — add `entryRowForSelectedKey` (reuse
  `flattenEntrySummary`, `entryRowFromSummary`, `canonicalEntryMode`; derive label/family/threshold/fillMode via
  `tradeUniverse.familyFromKey`/`extractThreshold`/`fillModeFromKey`/`armCandleIndex`).
- `components/lab/entries/EntriesWorkspace.jsx` — append the selected row to `exactRows` + `availableModelKeys`
  (gated on `selectedModelKey ∈ discoveredModelKeys` and not already present); pass through to
  `ModelAnalysis`/`ExactResultsPanel`.
- (No change to `PLANNED_ENTRY_MODES`, the selector, the store, or `buildEntryResultRows`'s planned loop.)
- `TradeDiffExplorer` already reads `tradesByMode[selectedModelKey]`, so it populates once the row is selectable
  and rows are resident — no change expected, but verify in validation.

## Validation plan (for the future change)
1. Select **TE 25% · Arm C40** → a single new row appears in ExactResultsPanel labelled "Triggered Edge 25% ·
   Arm C40", with summary metrics + `deltaVsBaseline` vs edge-touch baseline; it is highlighted as selected.
2. Before its rows load (summary only) → row shows summary KPIs (real) or a "rows loading" state — never 0R
   fabricated; chip "Summary only"/"Loading rows".
3. After load → trade-level panels (`TradeDiffExplorer`) populate for that variant; exactly **one** CSV fetched.
4. Switch to another deep arm → previous synthetic row replaced by the new one; one CSV per switch; no 71-load.
5. Baseline-only run → no selector, no synthetic row, unchanged.
6. RunDetail + Entries Lab still agree on the active variant (shared store scenario).

*Audit only. No code changed, nothing staged/committed/pushed.*
