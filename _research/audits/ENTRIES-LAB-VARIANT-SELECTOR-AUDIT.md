# Entries Lab — variant selection UX (audit)

**Repo:** FX-OB-Research-Lab. **Audit only — no code.**

## Current UX map
- **Header** (`shared/EntryWorkspaceHeader.jsx`): shows run identity, a `${modelCount} Models` / "Baseline Only"
  pill (`:59`,`:93`), and a `PairedRunSelector` (FFT-OFF run pairing — unrelated to entry-variant choice). **No
  entry-variant dropdown/search.**
- **The de-facto "selector" is row-click in a table.** Selecting a model happens only by clicking a row in
  `model/ExactResultsPanel.jsx` (`ResultRow` → `setSelectedModelKey`, `:181-182`) or `model/TradeDiffExplorer.jsx`
  (`:93`). There is no list/dropdown of the discovered universe.
- **The table only lists a STATIC planned subset.** `buildEntryResultRows` (`analytics/entryAnalytics.js:302`)
  flatMaps over **`PLANNED_ENTRY_MODES`** (`analytics/entryRegistry.js:214` — a hand-curated list: baseline +
  penetration family + a few TE), keeping a row only when that planned mode is present in the run's
  `entryResults.summary` or has resident `tradesByMode` rows (`:318-320`). So the rows shown ≠ the discovered
  universe.
- **"71 variants" comes from a DIFFERENT enumeration.** `EntriesWorkspace.jsx` derives `discoveredModelKeys`
  from `collectAllEntryKeys(activeRun, trades)` → `entrySummaryKeys` → `entryResults.summary` (the full TE
  threshold×arm universe). That count is shown, but it is **not** wired to any selector and is **not** what
  `PLANNED_ENTRY_MODES` enumerates — so e.g. `TE 25% · Arm C40` is detected but cannot be picked.

## 2. Does a selector exist but hidden/disabled/resident-only?
Partly: selection EXISTS as `selectedModelKey`, but the only way to set it is clicking a rendered row, and the
rows are limited to `PLANNED_ENTRY_MODES ∩ summary` (resident/planned). There is **no control that surfaces the
71 discovered variants**. So it's "resident/planned-driven, no dropdown," not hidden.

## 3. State controlling the selection
`selectedModelKey` in `shared/useEntryWorkspace.js` (`:101`, persisted to `localStorage` `LS_MODEL`, **shared
across runs**), set via `setSelectedModelKey` (`:127`), and reconciled to the run by `useModelSelectionGuard`
(`:203`) against `availableModelKeys` (the resident `exactRows[].mode` set). It is a **local UI selection**, not
the store scenario.

## 4. How baseline comparison is calculated
`baselineEntryRow(trades)` (`entryAnalytics.js:55`) = **"Baseline · Edge Touch"** (all eligible setups). Each
variant row gets `deltaVsBaseline = round1(netR − baseline.netR)` in `entryRowFromSummary` (`:128`). So
"vs baseline / edge-touch" is a per-row delta against the edge-touch baseline — already computed for any row
that exists. No change needed to comparison math; the gap is purely that the chosen variant must *have a row*.

## 5. Is selecting a metadata-discovered-but-unloaded variant safe?
**Safe but incomplete, and currently it does not load rows.** Entries Lab selection does **not** trigger any
lazy load — grep shows **no** `setScenario` / `useLazyEntryVariant` / `ensureVariantTrades` in
`src/components/lab/entries/`. So selecting a variant only sets `selectedModelKey`; downstream trade-level views
read resident `entryResults.tradesByMode[key]`, which is empty for an unloaded variant → those panels show no
data (no crash). The store's lazy loader (`useLazyEntryVariant` inside `useRunVariant`) only fires when the
**store scenario** is set to that variant — which Entries Lab never does. So today a discovered-but-unloaded
variant is selectable-in-principle but yields an empty trade-level view and never auto-loads.

## Missing piece (one line)
A **visible, data-driven variant selector** over the discovered universe (`collectAllEntryKeys`) that (a) sets
the selection and (b) triggers a **single-variant lazy row load** via the store scenario — instead of relying on
`PLANNED_ENTRY_MODES`-limited table rows and a no-load local selection.

## Recommended smallest UX
1. **Searchable dropdown/combobox** in `EntryWorkspaceHeader` (next to the "N Models" pill), populated from
   `discoveredModelKeys` (already computed in `EntriesWorkspace`), each labelled via the existing
   `entryVariantLabel` / `variantLabel` helper (e.g. *"Triggered Edge 25% · Arm C40"*). Filterable so 71 entries
   stay usable; **render labels only — no row data** (zero eager loading).
2. **On select, drive the store scenario, not just local state.** Reuse the canonical path RunDetail uses —
   `useRunVariant(activeRunId).setResultView(...)` (or `setScenario`) keyed off the chosen entry key — so
   `useTradeUniverse`/`TRADES` resolve to that variant **and** `useLazyEntryVariant` lazy-loads **that one
   variant's** CSV on demand. Mirror into `setSelectedModelKey` for the summary table highlight so both stay in
   sync. (RunDetail already builds this list via `buildAvailableOptions(collectAllEntryKeys(...))`; Entries Lab
   should consume the same helpers rather than `PLANNED_ENTRY_MODES`.)
3. **Per-variant load-status chip** next to the selector: "summary only" → "loading rows…" → "rows loaded",
   from `useRunVariant().lazyStatus` (or a resident-rows check on `tradesByMode[selectedKey]`). Trade-level
   panels show a "rows loading" placeholder until resident — never fabricated data.
4. **Comparison vs baseline:** unchanged — the selected variant's row already carries `deltaVsBaseline` vs the
   edge-touch baseline; once its rows load, the trade-level diff (`TradeDiffExplorer`) populates against
   baseline.
5. **No eager loading of all 71:** the selector lists labels only; exactly one variant's rows load per
   selection (the existing `useLazyEntryVariant` single-CSV fetch). The summary comparison table keeps using
   `entryResults.summary` (already resident, cheap).

## Exact files/functions to change (when implemented)
- `shared/EntryWorkspaceHeader.jsx` — add the variant combobox UI (props: discovered options + selected + onSelect + loadStatus).
- `EntriesWorkspace.jsx` — pass `discoveredModelKeys` (→ labelled options) into the header; on select call
  `useRunVariant().setResultView`/`setScenario` **and** `setSelectedModelKey`; surface `lazyStatus`.
- `shared/useEntryWorkspace.js` — keep `selectedModelKey`; optionally relax `useModelSelectionGuard` so a
  discovered (not-yet-resident) key is allowed as the selection (today it reconciles only against resident
  `availableModelKeys`).
- Reuse (do **not** modify): `data/tradeUniverse.js` `collectAllEntryKeys`/`buildAvailableOptions`,
  `data/useRunVariant.js` (`setResultView`, `lazyStatus`), `entryFormatters`/`entryRegistry` label helpers.
- **Do NOT** add the 71 dynamic variants to `entryRegistry.PLANNED_ENTRY_MODES` — the selector must be
  data-driven from `collectAllEntryKeys`, not the static registry.

## Validation plan (for the future change)
1. Open Entries Lab on the 71-variant run → selector lists all 71 labelled options, no row data fetched (network
   idle); table still renders summary comparison.
2. Pick **Triggered Edge 25% · Arm C40** → store scenario updates; status chip → "loading rows…" → "rows
   loaded"; trade-level panels populate; summary row shows `deltaVsBaseline` vs edge-touch baseline.
3. Confirm **only one** variant CSV is fetched per selection (no 71-way load); switching variants fetches just
   the new one.
4. Pick a summary-only variant with no resident rows → shows "rows loading"/"summary only", never fabricated 0R
   KPIs; no freeze.
5. Reload page with a persisted `selectedModelKey` → reconciles to a valid discovered variant (or baseline),
   no crash.
6. Baseline-only run → selector shows baseline only; no entry-variant options.

*Audit only. No code changed, nothing staged/committed/pushed.*
