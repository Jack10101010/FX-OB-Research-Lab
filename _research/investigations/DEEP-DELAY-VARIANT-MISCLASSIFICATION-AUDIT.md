# Deep-Delay Variant Misclassification — Audit

**Mode:** Audit only. No code changed.
**Runs examined:** `86c11cdc…` (delays **20–50**) and `22cdd55d…` (delays **0–6**).

---

## TL;DR

The data layer is correct end-to-end — the backend manifest, the importer, and the
trade-universe key math all handle deep delays (`d20…d50`) generically. The bug is in the
**selector UI and the fill-mode pick/coerce fallback**, which are still hardwired to the
legacy **C0–C6** arm set (`same`/`next`/`d2…d6`). A run whose arms are `d20…d50` therefore:

* shows **seven dimmed "Arm C0–C6" buttons that don't exist** in the run, and none for its real arms, and
* when you click Triggered Edge / a threshold, the fill-mode picker falls back to `null`,
  producing a canonical key with **no delay suffix** → a filename that doesn't exist →
  **Trades = 0 / Status: Unavailable / Analytics: Baseline fallback**.

It is **not** a lazy-loader failure and **not** a manifest-population failure. Lazy import is
incidental — deep-delay runs are large, so they arrive via the 413→lazy path, which makes the
empty default more visible. The bug reproduces on an *eager* deep-delay run too.

**Important correction to the premise:** the two named runs are *different configs*, not the same:

| Run | `triggered_edge_candle_delays` | Files on disk | UI is… |
|---|---|---|---|
| `22cdd55d…` | `[0,1,2,3,4,5,6]` | `_same _next _d2…_d6` | **correct** — it really did run C0–C6 |
| `86c11cdc…` | `[20,25,30,35,40,45,50]` | `_d20…_d50` | **broken** — shows dead C0–C6, can't reach C20–C50 |

So "this run did NOT execute C0–C6" is true for `86c11cdc` but false for `22cdd55d`.

---

## A. Root cause

A **shallow-delay (C0–C6) assumption** is baked into the selector + fill-mode resolution,
in four live places. The arm dimension is rendered from a hardcoded list and the fallback
pickers only know how to land on `null` / `same` / `next` — never on a `d20…d50` arm:

1. **`components/lab/ResearchRunHeader.jsx` → `FILL_MODE_SLOTS`** (lines ~141–149).
   Hardcoded `[same→C0, next→C1, d2→C2 … d6→C6]`. Row C maps each slot through
   `availFillModes.has(fm)`. For `86c11cdc`, `availFillModes = {d20,d25,d30,d35,d40,d45,d50}`,
   so **all seven slots miss** → every arm renders as a dimmed `<span>` "No data for this fill
   mode in this run," and there is **no slot for the run's real arms**. → This is the literal
   "Arm C0–C6 showing" symptom.

2. **`components/lab/ResearchRunHeader.jsx` → `pickFillMode`** (lines ~112–121).
   Fallback chain is `preferFm → null → "same" → "next" → null`. For a deep-delay run the
   options are `[d20…d50]` (no `null`/`same`/`next`), so it **returns `null`**. Clicking
   *Triggered Edge* or a threshold therefore calls
   `setResultView({family:"triggered_edge", threshold:t, fillMode:null})`.

3. **`data/tradeUniverse.js` → `coerceFillMode` / `safeFillModeWhenNoCombined`**
   (lines ~310–316, ~339–345). Same shallow fallback: with `requested = null` and no combined
   key, it tries `next` then `same`, finds neither, and resolves `fillMode = null`. Then
   `buildCanonicalKey("triggered_edge", thr, null)` → `entry_triggered_edge_10p0` (**no suffix**).
   `deriveSourceFile` → `trades_<variant>__entry_triggered_edge_10p0.csv`, **which does not exist**
   (only `…_d20.csv … _d50.csv` do). The universe is empty → `isUnavailable = true`,
   `analyticsChipLabel = "Baseline fallback"`, trade count 0.

4. **`data/tradeUniverse.js` → `derivePrimaryResultView`** (lines ~774, ~819).
   `DELAY_PREFERENCE = [3,2,1,0]` and the research scan suffixes `["_d3","_d2","_next","_same"]`
   are shallow-only, so a deep-delay run gets **no sensible default arm** and opens on Baseline.
   (For a *lazy* run it also can't derive from rows, because `tradesByMode` is empty until a
   variant is selected — see §4 below.)

A fifth, **dead-code** copy of the same hardcoded list exists at
`pages/RunDetail.jsx → resultViewGroups → FILL_SLOTS` (lines ~393–401). `resultViewGroups`
is computed but never rendered (it isn't passed to `ResearchRunHeader`, which receives
`resultViewOptions`). Cosmetic cleanup only — not part of the live failure.

## B. Confidence

**Very high.** Backed by primary evidence: both runs' `config.json`, the on-disk filenames,
the actual `build_run_manifest` output for `86c11cdc` (28 entry scenarios, distinct fill_modes
`d20…d50`, `entry_results.allow_multi_position` keyed `entry_triggered_edge_*_d20…d50`), the
backend regex (`(?:_(same|next|d\d+))?` — matches deep delays), and the full frontend resolve
chain. The failing canonical-key path (`pickFillMode→null` → coerce→null → no-suffix filename)
is deterministic from the code.

## C. Exact files involved

| File | Symbol | Role in bug |
|---|---|---|
| `frontend/src/components/lab/ResearchRunHeader.jsx` | `FILL_MODE_SLOTS` (~141) | **Selector** — hardcoded C0–C6 arm buttons (live renderer) |
| `frontend/src/components/lab/ResearchRunHeader.jsx` | `pickFillMode` (~112) | **Key mapping** — null fallback when no shallow arm |
| `frontend/src/data/tradeUniverse.js` | `coerceFillMode`, `safeFillModeWhenNoCombined` (~310, ~339) | **Key mapping** — coerces deep arm to null suffix |
| `frontend/src/data/tradeUniverse.js` | `derivePrimaryResultView` (~774, ~819) | **Default selection** — shallow-only preference/scan |
| `frontend/src/pages/RunDetail.jsx` | `FILL_SLOTS` in `resultViewGroups` (~393) | Dead duplicate (cleanup only) |

**Correct already (do not touch):** `fillModeFromKey`, `buildCanonicalKey`, `extractThreshold`,
`buildAvailableOptions` (incl. `fillRank` up to C50), `deriveSourceFile`, `entryVariantStorageKeys`,
`ensureVariantTrades`, the backend `parse_entry_filename` / `build_run_manifest`. These are all
delay-agnostic and handle `d20…d50` already.

## D. Smallest safe fix

Make the **arm dimension data-driven** and the **fallbacks delay-aware** — three small edits,
no backend, no importer, no key-math change:

1. **Selector (`ResearchRunHeader.jsx`).** Replace the hardcoded `FILL_MODE_SLOTS` with slots
   **generated from `availFillModes`** (i.e. the run's real `resultViewOptions` for the selected
   family+threshold). Derive each label from the fill mode: `same→"Arm C0"`, `next→"Arm C1"`,
   `d{n}→"Arm C{n}"`, sorted by the existing depth rank. Result: a C20–C50 run shows exactly its
   seven real arms; a C0–C6 run is unchanged.

2. **`pickFillMode` (`ResearchRunHeader.jsx`).** After `null/same/next` miss, fall back to the
   **first available delay arm** (e.g. lowest `d{n}`) instead of `null`, so selecting the model
   lands on a real, existing variant.

3. **`coerceFillMode` / `safeFillModeWhenNoCombined` (`tradeUniverse.js`).** Same one-line
   extension: when no combined / `same` / `next` exists, return the first available `d{n}` arm
   rather than `null`, so the canonical key carries a suffix that maps to a real file.

*Optional follow-up (not required to clear the symptom):* make `derivePrimaryResultView`'s
`DELAY_PREFERENCE` / scan suffixes delay-agnostic so deep-delay runs **auto-open** on a real arm;
delete the dead `FILL_SLOTS`/`resultViewGroups` in `RunDetail.jsx`.

Item **1** alone removes "Arm C0–C6 showing" and makes the deep arms clickable; items **2–3**
remove "Trades = 0 / Unavailable" by ensuring every selection resolves to an existing file.

## E. Classification of the issue

* **Selector generation** — ✅ primary ("Arm C0–C6 showing", deep arms unselectable).
* **Variant key mapping** — ✅ primary (`pickFillMode`/`coerce` → `null` suffix → non-existent file → Trades = 0).
* **Lazy loader failure** — ❌ no. `useLazyEntryVariant`/`ensureVariantTrades`/`deriveSourceFile`
  fetch and store deep-delay files correctly *when handed the right key*.
* **Manifest population** — ❌ no. The manifest correctly lists all `d20…d50` scenarios and
  `entry_results` keys; the frontend correctly extracts them into the option tree.
* **Multiple causes** — ✅ it's the **two selector/mapping layers together** (UI slots + fallback
  pickers), with a secondary default-selection weakness. Lazy import is **incidental**, not causal.

---

### Per-goal trace (matches the audit request)

**1. Selector source.** The arm buttons come from a **static UI array**
(`ResearchRunHeader.jsx FILL_MODE_SLOTS`, C0–C6), gated by availability from run metadata
(`availFillModes`, derived from `resultViewOptions` ← `buildAvailableOptions` ← `collectAllEntryKeys`).
Thresholds are hybrid: union of run-present thresholds **+** a static hint list `[10,25,50,75]`
(non-present ones render dimmed). So *thresholds* are mostly metadata-driven; *arms* are static.

**2. Resolver, e.g. "10% + C2".** `pickFillMode("triggered_edge", 10, "d2")` → opts for `86c11cdc`
are `[d20…d50]` → `"d2"` not included, `null` not included, `same/next` not included → returns
`null` → `buildCanonicalKey("triggered_edge", 10, null)` = `entry_triggered_edge_10p0` (no suffix).
Against `86c11cdc` the only real keys are `entry_triggered_edge_10p0_d20 … _d50`, so the produced
key **does not exist** → baseline fallback. Against `22cdd55d` (`d2` exists) the same path yields
`entry_triggered_edge_10p0_d2`, which **does** exist → works. The resolver generates keys that
don't exist **only for deep-delay runs**.

**3. Lazy manifest contents (verified).**
`86c11cdc`: thresholds `{1,3,5,10}`; arms `{d20,d25,d30,d35,d40,d45,d50}`;
`entry_scenarios.scenario_count = 28`; `available_variants = [allow_multi_position]`;
`entry_results.allow_multi_position` keyed `baseline + entry_triggered_edge_{1,3,5,10}p0_{d20…d50}`.
`d20–d50` are **all present**; `d2–d6`/`same`/`next` are **absent** (correct — the run didn't make them).
`22cdd55d`: thresholds `{10,25}`; arms `{same,next,d2,d3,d4,d5,d6}` — also correct.
`entryScenarioIndex` is populated from these but is **not consumed** by `collectAllEntryKeys`
(the option tree is built from `entry_results` summary keys instead — which still contain the deep arms).

**4. Lazy loader.** When a deep arm is *actually* selected (e.g. via a persisted Strategy-Map
scenario carrying `fillMode:"d20"`), `useLazyEntryVariant` sees `universe.sourceFile =
trades_allow_multi_position__entry_triggered_edge_10p0_d20.csv`, calls `ensureVariantTrades`,
which fetches via the sidecar `/file` endpoint and stores rows under the correct mode key
(`entryVariantStorageKeys`). **The loader works.** It is never reached for deep runs only because
the selector/coerce layer never produces the deep-arm key. (Separately, on first lazy open
`tradesByMode` is empty, so `derivePrimaryResultView`'s row-based checks fail and the run opens on
Baseline — independent of the suffix bug, same shallow-default weakness.)

**5. UX recommendation.** Yes — **generate the arm (and ideally threshold) selector entirely from
run metadata** (`resultViewOptions`), showing only arms the run actually produced, labelled
`Arm C{n}` from the delay. Replace "Arms: C0 C1 C2 C3 C4 C5 C6" with the run's real
"C20 C25 C30 C35 C40 C45 C50," and drop the static threshold hint list (or keep it clearly
secondary). This eliminates the entire class of "phantom arm + dead fallback" bugs for any future
delay set.

*No code was changed. Audit only.*
