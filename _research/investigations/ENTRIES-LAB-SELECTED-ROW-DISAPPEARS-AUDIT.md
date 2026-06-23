# Entries Lab — selected dynamic row disappears on click (audit)

**Repo:** FX-OB-Research-Lab. **Audit only — no code changed, nothing staged/committed/pushed.**

## 1. State flow when clicking a dynamically appended selected-variant row

1. **Pick from selector** (`EntryVariantSelector.onPick`, lines 77–88): sets **two** independent things —
   `setResultView({family,threshold,fillMode})` (the **store scenario**, drives lazy load + the selector's own
   display) **and** `setSelectedModelKey(buildCanonicalKey(...))` (the workspace's local highlight key).
2. **Row gets appended** (`EntriesWorkspace.exactRows`, lines 97–106): because
   `selectedModelKey ∈ discoveredModelKeys` and it isn't already a planned row, `entryRowForSelectedKey(...)`
   is appended → the row renders and `availableModelKeys` (lines 110–112) now includes it.
3. **Row renders selected** (`ExactResultsPanel.ResultRow`, line 178): `isSelected = !row.isBaseline &&
   row.mode === selectedModelKey` → **true** (the row exists *because* its mode equals `selectedModelKey`).
4. **User clicks the row** (`ResultRow.handleClick`, lines 180–183):
   `setSelectedModelKey(isSelected ? null : row.mode)`. Since `isSelected` is **true**, this fires
   **`setSelectedModelKey(null)`** — the standard toggle-off used by every planned row.
5. **`exactRows` re-computes** (line 98): `if (!selectedModelKey || !discoveredModelKeys.includes(...)) return
   plannedExactRows;`. `selectedModelKey` is now `null` → the dynamic row is **not appended** →
   **the row vanishes** from the table (and from `availableModelKeys`).
6. **Guard does not restore it** (`useModelSelectionGuard`, lines 229–235): same run (`runChanged` false) and
   `selectedModelKey` is `null`, so the "in-session deselect is preserved" branch leaves it `null`. The row
   stays gone until the user re-picks from the selector.

## 2. Why the row disappears but the selector still shows it selected

The dynamic row has **two masters that were never coupled**:

- Its **existence** is gated on `selectedModelKey` (a *toggleable* highlight key) in `exactRows`.
- The **selector's "selected" display** is derived from `resultView` (the *store scenario*),
  `EntryVariantSelector` lines 69–72: `selectedKey = ${family}_${threshold}_${fillMode}`.

Clicking the row only calls `setSelectedModelKey(null)` — it **never touches `resultView`**. So:

- `resultView` unchanged → selector still renders the variant as selected, status chip still "Rows loaded".
- `selectedModelKey` = null → the append gate fails → the row is removed.

Result: **selector = selected, table row = gone.** The two selection systems desync because the row's *presence*
is tied to the volatile toggle instead of the durable store scenario that the selector reflects. (A *planned*
row never has this problem: toggling it to null only drops the highlight; the row itself is always enumerated
from `PLANNED_ENTRY_MODES`.)

## 3. Every selection state involved

| state | source / owner | role | changed by row click? |
|---|---|---|---|
| **`selectedModelKey`** | `useEntryWorkspace` → `localStorage` `fxob_entries_workspace_model_selection_v1` | highlight key **and** (newly) the gate for appending the dynamic row | **Yes** → set to `null` (toggle-off) |
| **"activeModelKey" / store scenario** | `useRunVariant(runId).resultView` → `universe.sourceKey` | canonical active variant; drives lazy CSV load, `universe.trades`, and the selector's display | **No** (there is no separate `activeModelKey` var; `resultView`/`sourceKey` is the de-facto one) |
| **`selectedRow` / `isSelected`** | `ResultRow` derived (`row.mode === selectedModelKey`) | per-row highlight + click target | derived; flips to false |
| **table selection state** | none separate — `ExactResultsPanel` reads `selectedModelKey` straight through | the table has no independent selection model | n/a |
| **selector state** | `EntryVariantSelector` derived from `resultView` (lines 69–72) | dropdown label + highlighted option + status chip | **No** → stays "selected" → the desync |

Key point: there are effectively **two** selection identities — `selectedModelKey` (toggle/highlight) and
`resultView`/`sourceKey` (durable scenario) — and only the selector reads the durable one.

## 4. Smallest fix

**Gate the dynamic row's existence on the durable store scenario, not on the toggleable `selectedModelKey`.**
Then clicking the row toggles only the highlight (as it does for planned rows); the row persists, and the
selector and table stay in sync because both follow `resultView`.

Concretely (smallest viable change, `EntriesWorkspace.jsx` only):
- Read the active scenario key from the store — `const { resultView, universe } = useRunVariant(activeRunId);`
  and derive `scenarioKey` from `universe?.sourceKey` (or `buildCanonicalKey(resultView…)`).
- In the `exactRows` memo, change the gate from `selectedModelKey` to **`scenarioKey`**:
  append `entryRowForSelectedKey(activeRun, scenarioKey, baseline, ACTIVE_TRADE_VARIANT)` when
  `scenarioKey ∈ discoveredModelKeys` and not already a planned row. Add `scenarioKey` to the deps.
- Leave `selectedModelKey` as the pure highlight key (its `null` toggle now only un-highlights).

Why this is smallest / safe: one component, one memo's gate + deps; reuses the existing helper unchanged; no
change to `ResultRow`'s toggle semantics, the selector, `PLANNED_ENTRY_MODES`, the store, or the guard. The
selector already writes `resultView` on every pick, so the row appears on pick and **survives** a
highlight-toggle click.

Rejected smaller-looking alternatives:
- **Make the appended row non-toggling** (special-case its `handleClick` to never set `null`): diverges row
  behavior, surprises users (can't deselect), and still leaves existence tied to `selectedModelKey`.
- **Re-pick in the guard when null**: fights the intentional "in-session deselect" semantics and would also
  prevent deselecting *planned* rows.

## Should Entries Lab keep rendering `PLANNED_ENTRY_MODES` at all?

### A) Current model — planned rows + one selected dynamic row
**Pros**
- Instant, curated comparison set on load (baseline + penetration + TE C0–C3) without any selection.
- Zero migration; existing analytics (best-in-family, highlights, family grouping) already operate over it.
- Deep/odd arms (C4–C50, 1%/5%) handled on demand via the one appended row.

**Cons**
- `PLANNED_ENTRY_MODES` is a **static 25-mode subset**; a run may contain 71 variants but the table shows ~a
  dozen — the curated list silently misrepresents the run's universe.
- **Two enumeration systems** (static planned vs discovered/dynamic) — the exact source of this bug class
  (toggle/append desync) and of the earlier "half-wired selector" bug.
- "Best model"/highlights are computed over the planned subset, not the full universe → can mislead research
  conclusions ("best arm" may simply be the best *planned* arm).
- Registry maintenance: new families/arms must be hand-added to `entryRegistry.js` or they never appear by
  default.

### B) Research model — baseline + user-selected variants only
**Pros**
- **Truthful**: the table shows exactly baseline + what the user chose; no misleading static subset.
- **Single source of truth** (discovered universe + selection) → eliminates the planned-vs-dynamic desync bug
  class entirely.
- Scales to 71+ variants and deep arms with **no registry maintenance**.
- Lazy by construction: only selected variants' CSVs load.

**Cons**
- Loses the "instant curated comparison" — the table is baseline-only until the user picks (worse cold-start;
  a default auto-pick of, say, the run's headline variant would mitigate).
- Needs **multi-select** for cross-variant comparison (today's selection is single) → real UX work in the
  selector and selection state.
- Planned-only analytics need rework: best-in-family/highlights must compute over the *selected* set, and
  `ExactResultsPanel`'s family grouping must handle arbitrary dynamic families.
- Loses curated metadata/labels that `PLANNED_ENTRY_MODES` carries (descriptions, ordering) unless replicated
  from the key-derivation helpers.

### Migration effort
- **B is moderate, medium-risk** (touches the table core): replace `buildEntryResultRows`' `PLANNED_ENTRY_MODES`
  enumeration with a "selected variants" set (baseline + chosen), make the selector multi-select + lift
  selection to an array, rework highlights/best-in-family + family grouping to the selected set, and add a
  sensible default selection. ~4–6 files (`entryAnalytics.js`, `EntriesWorkspace.jsx`, `ExactResultsPanel.jsx`,
  `EntryVariantSelector.jsx`, `useEntryWorkspace.js`, guard).
- **Fixing A (the §4 fix) is low effort / low risk** and resolves the immediate disappearance bug now.

**Recommendation:** ship the §4 fix now (decouple row existence from the toggle). Treat **B** as the right
long-term direction for research honesty, but stage it: an interim **hybrid** — render only the planned rows
that **actually exist in this run** (have summary or resident rows) + selected dynamic rows, and label the
table as a subset — removes the most misleading part of A (planned-but-absent rows) with far less work than a
full multi-select rebuild.

*Audit only. No edits, nothing staged/committed/pushed.*
