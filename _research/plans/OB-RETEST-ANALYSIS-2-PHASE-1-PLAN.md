# OB Retest Analysis — Phase 1 Implementation Plan (OB-RETEST-2)

**Status:** Plan only — no implementation. No backend / no export changes.
**Source of truth:** `OB-RETEST-ANALYSIS-1.md` (§4 placement, §5 model, §9 risks).
**Goal:** Smallest clean **frontend-derived** MVP — a new Order Block Lab tab, **"Retest Lab"**, that reconstructs retests from already-imported candle data and answers one question: *do retested OBs survive or fail, and how big is the reaction?*

**Hard constraints (carried from the brief):**
- Use existing IndexedDB candles when available; derive everything in the frontend.
- Use existing OB bounds + OB↔trade join.
- No backend, no exporter fields, no `ob_retests.csv` yet.
- Gated: candles missing → clear empty state (never show partial/misleading numbers).
- Preserve existing architecture, styling, and tab patterns.

---

## 0. Confirmed integration points (so the plan is concrete)

| Need | Existing hook / shape | Where |
|---|---|---|
| Active run + OBs | `useDataset()` → `activeRunId`, `runs[activeRunId].orderBlocks` | `OrderBlockLab.jsx:98,137-138` |
| Trades (universe) | `useTradeUniverse()` → `.trades` (joined to OB via `obId`) | `OrderBlockLab.jsx:99,136` |
| OB↔trade map + first-touch status | `buildTradesByObId(trades)`, `deriveOBLifecycle(ob, trade, …)` | `data/obLifecycle.js` |
| **Candle access (lazy)** | `useDataset() → loadCandlesForRun(runId)` (async) + `candleLoadStatus`; run flags `hasCandles`, `candleCount`, `candlesStorage` | `data/store.js:992,1890` |
| Candle row shape | `{ i, t, time(epoch s), o, h, l, c }` | `data/importer.js:parseCandlesCSV` |
| OB row shape | `{ id, top, bot, side:'bull'|'bear', originTime, endTime(detection), detectionIndexRaw }` | `data/importer.js:parseOrderBlocksCSV` |
| Tab shell + tab array | `OBLabTabShell`, `TABS=[…]` (persist key `oblab-active-tab-v1`) | `OrderBlockLab.jsx:538-543` |
| KPI cards / table / panels | `MetricChip`, `DataTable`/`ColoredR`/`Pill`, `NeonPanel`, `CanonicalBucketTable`, `Segment`/`NeonSelect` | `components/lab/*` |
| Empty-state idiom | `NeonPanel` + `Pill tone="muted">No candles"` / "Import a run…" | `Runs.jsx:556`, `RunDetail.jsx:2934` |

The retest geometry primitive already exists in `ghost_tracker.py` (penetration %, fill, close-beyond invalidation, MAE/MFE). Phase 1 **ports that geometry to JS** and **extends it past first exit** to count later retests.

---

## 1. Exact files to edit / create

**Create (4 new files, all isolated):**

1. `frontend/src/data/obRetest.js` — pure, framework-free derivation module. The only place retest logic lives.
   - Exports: `DEFAULT_RETEST_CONFIG`, `deriveRetests({ orderBlocks, tradesByObId, candles, config })` → `{ events, perOB, summary, meta }`.
2. `frontend/src/components/lab/retest/useRetestData.js` — React hook. Pulls active-run OBs/trades, triggers `loadCandlesForRun`, runs `deriveRetests` (memoized / worker), exposes `{ status, events, perOB, summary, config, setConfig }`.
3. `frontend/src/components/lab/retest/RetestLabTab.jsx` — tab content: empty/loading/error/derived states, config bar, summary cards, breakdown panels, event table.
4. `frontend/src/data/__validation__/obRetest.logictest.cjs` — tiny Node logic test (matches existing `.cjs` test idiom, e.g. `frontend/.sp1_logictest.cjs`). Synthetic bull + bear OB + candle series asserting survive/fail/open.

**Edit (1 existing file, minimal surface):**

5. `frontend/src/pages/OrderBlockLab.jsx` —
   - add import of `RetestLabTab`;
   - add one `tabRetestLab = <RetestLabTab orderBlocks={orderBlocks} trades={trades} activeRun={activeRun} activeRunId={activeRunId} />`;
   - append one entry to the `TABS` array: `{ key:"retest-lab", label:"Retest Lab", short:"Retest", content: tabRetestLab }`.

**Do NOT touch:** `backend/*`, `importer.js`, `store.js`, `artifactStore.js`, `obLifecycle.js`, `ghost_tracker.py`, any export schema. (Read-only reuse only.) Optional worker file is deferred to Commit 5 below — not required for a working MVP.

---

## 2. Minimal frontend-derived data model

Deliberately a **subset** of the §6.1 backend spec — only what proves survive/fail. No new persisted fields; computed in memory, recomputed on demand.

```js
// One row per detected retest
RetestEvent = {
  obId, direction,           // 'bull' | 'bear'
  structure,                 // 'BOS' | 'CHoCH' | ''
  detectionTime,             // epoch s
  firstTouchTime,            // epoch s  (raw candle touch — canonical for Phase 1)
  firstFillTime,             // epoch s | null (from trade if traded; annotation only)
  firstTouchOutcome,         // 'win'|'loss'|'be'|'no_trade'|... (deriveOBStatus) | 'untraded'
  firstTouchWasTraded,       // bool
  retestIndex,               // 1..N
  retestTime, retestCandleIndex,
  retestType,                // 'wick_only'|'clean'|'deep'|'close_inside'|'full_penetration_no_invalidation'
  entryPenetrationPct, maxPenetrationPct,
  reactionMaxPips,           // favorable excursion from proximal edge
  outcome,                   // 'survived' | 'failed' | 'open'
  failureMode,               // 'none' | 'wick_breach' | 'close_breach'
  candlesToFailure,          // int | null
  session,                   // reuse ghost_tracker session bands
  minutesSinceFirstTouch,
}

PerOB = { obId, direction, structure, touchCount, retestCount,
          retestsSurvived, retestsFailed, retestsOpen,
          invalidatedOnRetestIndex /* int | null */ }

RunRetestSummary = {
  obsTotal, obsWithFirstTouch, obsRetested, retestRate,        // obsRetested / obsWithFirstTouch
  totalRetests, survived, failed, open,
  survivalRate, failureRate,                                   // over CLOSED retests only (exclude open)
  avgReactionPips, avgCandlesToFailure,
}

meta = { candleCount, computeMs, config, runId, dataBasis: 'derived_frontend' }
```

`config` = the §5.4 object, Phase-1 defaults: `reaction_window_candles:10`, `reaction_min:{mode:'pips',pips:8}`, `failure_threshold:'close_beyond_ob'`, `retest_entry_threshold_pct:0`, `retest_exit_threshold_pct:0`, `count_first_touch_as_retest:false`. (ATR mode + buffers deferred to keep MVP lean.)

---

## 3. Algorithm (single forward pass per OB)

Pre-pass once per run: sort candles by `time`; build `Float64Array` columns (`time,o,h,l,c`); binary-search helper `indexAtOrAfter(time)`.

For each OB (`top`, `bot`, `side`): derive `proximal/distal` edges, `height=|top-bot|`, `pipSize` from run config (`0.0001` default). Walk candles from `indexAtOrAfter(detectionTime)` forward with a small state machine. States: `WAIT_FIRST_TOUCH → BETWEEN(armed) → IN_RETEST(windowing) → INVALIDATED/END`.

**3.1 First touch** — first candle whose range intersects `[bot, top]` (i.e. `high ≥ bot && low ≤ top`) within `touch_epsilon`. Record `firstTouchTime`, `firstTouchCandleIndex`. Annotate `firstFillTime`/outcome/traded from `tradesByObId.get(obId)` via `deriveOBStatus` (annotation only — not used for geometry). Transition to "armed/between". *(If the OB invalidates on/before first touch → `touchCount=0`, `retestCount=0`, OB done.)*

**3.2 Leaving the zone (debounce)** — after a touch/retest, the OB is only re-armed for the next retest once price **exits**: penetration drops below `retest_exit_threshold_pct` (default 0 → candle fully outside proximal edge) **or** price moved ≥ `reaction_min` away. Prevents one grind counting as many retests.

**3.3 Retest** — once armed, the next candle that re-enters the zone (penetration ≥ `retest_entry_threshold_pct`) starts retest `k`. Record `retestTime`, index, `entryPenetrationPct`, `session`, `minutesSinceFirstTouch`. Open a forward window of `reaction_window_candles`.

**3.4 Window evaluation (survive vs fail vs open)** — across the window candles:
- track `maxPenetrationPct` and `reactionMaxPips` (favorable: bull = `high − proximal`, bear = `proximal − low`, ≥0);
- **failure** if breach per `failure_threshold`: `close_beyond_ob` → bull `close < bot` / bear `close > top` (optionally `wick_beyond_ob` → use high/low). On breach → `outcome='failed'`, `failureMode`, `candlesToFailure`, set `invalidatedOnRetestIndex=k`, **OB terminal**.
- **survived** if window completes with no breach **and** `reactionMaxPips ≥ reaction_min.pips` → `outcome='survived'`; classify `retestType`; re-arm for retest `k+1` after debounce.
- if window completes inside-zone with no breach and reaction < min → `survived` with `retestType='full_penetration_no_invalidation'` or `clean` (still alive); re-arm. *(Phase 1 folds "inconclusive" into survived-but-weak to stay binary; reaction magnitude carries the nuance.)*

**3.5 Open / right-censored** — if a retest's window extends past the **last candle** (or past run end), `outcome='open'`. Open retests are **excluded from survival/failure rates** and counted separately (`summary.open`). Same applies to an OB still un-invalidated at data end — its last retest may be `open`.

**3.6 Retest-type classification** (deterministic, on close): `wick_only` (wick in, close outside proximal) · `clean` (≤33% pen, holds) · `deep` (33–<100%) · `close_inside` (close within `[bot,top]`) · `full_penetration_no_invalidation` (reached 100%, never closed beyond).

---

## 4. Retest Lab tab — UI layout

Thin page wiring; all logic in the hook/module. Reuses existing components only.

```
<RetestLabTab>
 ├─ State gate (in order):
 │   • no active run            → NeonPanel "Import a run to analyse OB retests."
 │   • run has !hasCandles      → NeonPanel + <Pill tone="muted">No candles</Pill>
 │                                "This run was imported without candle data. Retest
 │                                 analysis needs candles. Re-import with candles or run the sidecar."
 │   • candleLoadStatus loading → NeonPanel spinner "Loading candles…"
 │   • load failed              → NeonPanel error + retry button
 │   • deriving                 → lightweight "Computing retests…" shimmer
 │   • ready                    → content ↓
 │
 ├─ Basis banner: <Pill>Derived · frontend</Pill> + candleCount + computeMs (honesty about source)
 ├─ Config bar (Segment/NeonSelect): reaction_window 5|10|20 · reaction_min pips · failure_threshold close|wick
 ├─ Summary cards (MetricChip ×7):
 │     Total OBs retested · Retest rate % · Survival rate % · Failure rate %
 │     · Avg reaction (pips) · Avg candles to failure · Open (excluded) count
 ├─ Breakdown (CanonicalBucketTable / simple grouped DataTable), collapsible:
 │     by Session · by BOS/CHoCH · by Bull/Bear · by First-touch outcome · by Retest #
 └─ Event table (DataTable): OB id · Dir · Struct · First-touch time · FT outcome ·
        Retest # · Retest time · Type · Max pen % · Max reaction (pips) ·
        Outcome (survived/failed/open via ColoredR/Pill) · Candles to failure · Session
```

Tooltips: pull glossary text verbatim from `OB-RETEST-ANALYSIS-1.md` §6.7 (inline `title=`/help props in Phase 1; no shared registry yet). "Best/worst conditions" cards and chart overlays are **deferred** (Phase 1 stays binary: survive/fail).

---

## 5. Performance plan (no UI freeze)

Worst case ≈ 151 OB × ~25k candles. Mitigations, in priority order:

1. **Lazy + memoized.** Only `deriveRetests` when the Retest Lab tab is active and inputs changed. Memo key = `(runId, candleCount, configHash)`. Tab content stays mounted (shell keeps it warm) but compute is gated behind an `enabled` flag so switching tabs doesn't recompute.
2. **Windowed scan, early stop.** Each OB starts at `indexAtOrAfter(detectionTime)` and **stops at invalidation** — no full-array rescans, no O(OB×allCandles) worst case in practice.
3. **Typed arrays.** Convert candles to `Float64Array` columns once; the inner loop reads numbers, not objects.
4. **Off the main thread (Commit 5, optional).** Move `deriveRetests` into a Web Worker; post `{obs, trades-lite, transferable typed arrays}`; receive `{events, perOB, summary}`. UI shows the "Computing…" state meanwhile. If skipped, fall back to a `requestIdleCallback`/chunked loop yielding every N OBs so the main thread never blocks > ~16 ms.
5. **Debounced config.** Recompute on config *commit*, not per keystroke/drag.

Target: < 150 ms typical on the main thread (windowed + typed arrays); worker makes it non-blocking regardless.

---

## 6. Edge cases to handle in Phase 1

(Subset of `OB-RETEST-ANALYSIS-1.md` §9 that applies to the derived MVP.)

1. **Candles absent** → empty state, no compute (primary gate).
2. **Candles present but OB outside candle time range** → skip OB, count as `touchCount=0`; don't crash on empty window.
3. **First touch never occurs** → OB had no return; in `obsWithFirstTouch` denominator? No — exclude (retest rate is over OBs that were touched).
4. **OB invalidated at/before first touch** → `retestCount=0`, included correctly (touched, zero retests).
5. **Right-censoring at data end** → `outcome='open'`, excluded from survival/failure rates, surfaced as its own card.
6. **Double-counting** → enforce debounce (§3.2); add a logic-test asserting a slow grind = 1 retest, not many.
7. **Same-candle reaction vs breach ambiguity** → evaluate breach on `close`; reaction on `high/low`. Document; keep consistent with `ghost_tracker` convention so Phase 2 reconciles.
8. **Reaction sign per direction** → bull favorable = up, bear = down; unit-test both directions (sign error silently inverts everything).
9. **Detection-TF vs execution-TF** → compare raw prices to `[bot,top]`, never bar indices.
10. **First touch ≠ first fill** → Phase 1 canonical first touch = raw candle touch; `firstFillTime` shown as annotation only, never conflated.
11. **Thin slices** → breakdown rows show sample size `n`; suppress rate styling below a min-N (e.g. n<5) to avoid overfit reads.
12. **Stale candle load** → respect `candleLoadStatus`; guard against setting state after unmount / run switch.

---

## 7. Implementation sequence (small, safe commits)

Each commit builds green and is independently revertible. The tab only becomes visible at Commit 3.

| # | Commit | Risk | Visible? |
|---|---|---|---|
| 1 | Add `data/obRetest.js` (pure module) + `__validation__/obRetest.logictest.cjs`. No imports elsewhere. | None (dead code) | No |
| 2 | Add `retest/useRetestData.js` hook (candle load + memoized derive). Not yet rendered. | Low | No |
| 3 | Add `retest/RetestLabTab.jsx` (gates + config bar + 7 summary cards). Wire 6th tab into `OrderBlockLab.jsx TABS`. | Low — one array + one prop | **Yes (MVP)** |
| 4 | Add breakdown panels + full event `DataTable` to the tab. | Low | Yes |
| 5 | *(Optional)* Move derive into a Web Worker for non-blocking compute. | Med | Yes (perf only) |

Stop-anywhere: after Commit 3 you already have a working "do retests survive or fail?" answer. Commits 4–5 are enrichment/perf.

---

## 8. Validation checklist

**Build / safety**
- [ ] `craco build` / dev compile passes; lint clean.
- [ ] Existing 5 OB Lab tabs unchanged (snapshot the `TABS` keys before/after).
- [ ] No import of `backend/*`, no edits to `importer.js`/`store.js`/`artifactStore.js`/exports.

**Gating**
- [ ] No run → "Import a run" state.
- [ ] `sample_run_bundle` (no candles) → "No candles" empty state, zero compute.
- [ ] `test_import_bundle` (has candles) → loads, computes, renders.
- [ ] Candle-load failure → error + retry, no crash.

**Correctness**
- [ ] Logic test: synthetic **bull** OB — clean retest that holds → `survived`; close below `bot` → `failed`; window past data end → `open`.
- [ ] Logic test: synthetic **bear** OB mirror (direction-sign guard).
- [ ] Debounce: one slow in-zone grind → exactly 1 retest.
- [ ] `survived + failed + open == totalRetests`; `survivalRate/failureRate` computed over closed only.
- [ ] Spot-check 2–3 real OBs from `test_import_bundle` against the chart: first-touch time and at least one retest classification look right by eye.
- [ ] First-touch outcome for traded OBs matches `deriveOBStatus` from the linked trade.

**Performance**
- [ ] `meta.computeMs` logged; typical run < ~150 ms main-thread (or non-blocking via worker).
- [ ] Switching tabs does not recompute (memo key holds); changing `reaction_window` does.
- [ ] No main-thread frame > ~50 ms during derive (perf trace) on the 151×25k bundle.

---

*End of OB-RETEST-2. Plan only — no code changed, no backend touched.*
