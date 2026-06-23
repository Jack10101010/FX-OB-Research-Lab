# FULL-PIPELINE-INTEGRITY-AUDIT-1
**Date:** 2026-06-05  
**Branch:** `codex-dev`  
**Repo:** FX-OB-Research-Lab (single monorepo — frontend + stub backend)  
**Backtester:** Lux-OB-Backtester runs on local machine; not accessible in sandbox.

---

## Executive Summary

**NOT TRUSTWORTHY YET for FFT / TE-delay-validity UI claims.**

The baseline pipeline (trade import, scenario selection, equity curve, session/news filters, ghost tracking fields in CSV/summary) is structurally sound and consistent. However, all recently-added FFT debug overlay features are **broken end-to-end** due to a function divergence between `useResolvedScenario.js` and `StrategyMap.jsx`. First-failed-tag cancels will silently show the wrong badge. Every delay-validity field (arm_candle_index, exited_ob_before_arm, ob_occupied_at_arm, armed_after_ob_exit) will always read as blank in the lifecycle panel checklist. The pink FFT cancel dot and tap→cancel line will never render on the chart.

There is also **no TE/FFT test data** in the repo to cross-check UI vs CSV, so a new set of runs is required before the Strategy Map can be declared correct for TE scenarios.

Baseline trade counts, R-values, wins/losses, and scenario selection labels are consistent with committed logic. The d2/d3 label rendering and scenario-correct OB right-edge fixes in uncommitted changes are correct in logic and should be committed.

---

## 1. Git / Repo State

**Branch:** `codex-dev`  
**Latest 10 commits:**
```
1c08b44 style(app): apply global blueprint grid background
a055172 fix(session-lab-v1): remove dead affordances
0e63a8b fix(session-lab-v1): clarify control center subtitle
c6789c7 fix(strategy-map): label delayed triggered-edge scenarios
bd8382e feat(strategy-map): add FFT debug overlays
e372fe2 feat(session-lab-v1): scope visual summary charts to session
c0fe5b3 feat(session-lab-v1): wire real what-if impact analytics
338e21f feat(session-lab-v1): wire real failure analytics
848228b feat(session-lab-v1): wire real OB analytics
d453840 feat(session-lab): default to primary result view
```

**Uncommitted changes (11 files, all unstaged):**
| File | Nature |
|------|--------|
| `frontend/src/App.js` | Minor |
| `frontend/src/components/lab/IntrabarInspector.jsx` | Minor |
| `frontend/src/components/lab/Sidebar.jsx` | Minor |
| `frontend/src/data/tradeClassification.js` | Cancel reason labels + struct matrix inline fix |
| `frontend/src/data/tradeUniverse.js` | d2/d3 label rendering fix |
| `frontend/src/pages/SessionLabV1/components/Header.jsx` | Minor |
| `frontend/src/pages/SessionLabV1/components/SessionControlCenter.jsx` | Minor |
| `frontend/src/pages/SessionLabV1/components/VisualSummaryStrip.jsx` | Minor |
| `frontend/src/pages/StrategyBuilder.jsx` | Hardcoded dataset date ceiling |
| `frontend/src/pages/strategyMap/ScenarioSelector.jsx` | d2/d3 label fix |
| `frontend/src/pages/strategyMap/useResolvedScenario.js` | Scenario-correct OB time1 + d2/d3 label |

**Untracked files of concern:**
- `ghost_tracker.py` — standalone ghost tracking implementation, NOT integrated into Lux-OB-Backtester
- `ghost_tracker_test.py` — unit tests for above

**Backend repo:** Lux-OB-Backtester is not present in this repo or sandbox. Config is sent as JSON via `sidecarClient.js` to a local sidecar process. The frontend config serialization is auditable; the backend internals are not directly inspectable here.

---

## 2. Backend Config Propagation Audit

**Verdict: Frontend → sidecar serialization is CORRECT for all audited fields.**

`StrategyBuilder.jsx` lines 1575–1615 correctly serialize:

| Config Field | Serialized As | Status |
|---|---|---|
| `triggered_edge_cancel_on_first_failed_tag` | Direct boolean | ✓ |
| `triggered_edge_cancel_on_retrace` | Direct boolean | ✓ |
| `triggered_edge_cancel_retrace_pips` | Direct number | ✓ |
| `triggered_edge_cancel_retrace_ob_pct` | Direct number | ✓ |
| `triggered_edge_trigger_thresholds` | Array of numbers | ✓ |
| `triggered_edge_candle_delays` | Sorted array of ints | ✓ |
| `triggered_edge_same_candle_modes` | Array of strings | ✓ |
| `triggered_edge_entry_level_pct` | Clamped 0–100 | ✓ |
| `session_filter_enabled` | Boolean | ✓ |
| `allowed_sessions` | Array of strings | ✓ |
| `news_blackout_enabled` | Boolean | ✓ |
| `news_blackout_minutes_before/after` | Numbers | ✓ |
| `news_blackout_impacts` | Array (default `["high"]`) | ✓ |
| `news_blackout_currencies` | Array | ✓ |
| `news_pause_pending_orders` | Boolean | ✓ |
| `news_block_new_fills` | Boolean | ✓ |
| `news_cancel_if_touched_during_blackout` | Boolean | ✓ |
| `news_flatten_active_trades` | Boolean | ✓ |

`sidecarClient.js` passes config as raw JSON with no field manipulation.

**Notes:**
- For the "Research Export" path (multi-model), the baseline path correctly zeroes out TE fields (`teCancelOnFirstFailedTag = false`, etc.) when `teEnabled = false`.
- The symmetric directional path uses `longDelays`/`shortDelays` arrays but does NOT pass `triggered_edge_cancel_on_first_failed_tag` into the `directional_entry_config` sub-object — only into the top-level config. Whether the backend reads from the top level or sub-object for directional runs is not verifiable here.
- **Cannot verify backend internal propagation** (simulate_trades, sequential/parallel paths) as Lux-OB-Backtester is not accessible.

---

## 3. Backend Behavior Regression Audit

**Cannot run controlled checks directly** — the backtester is not in this sandbox. Behavioral assertions below are code-based only.

**A. FFT OFF vs ON regression:** Cannot verify. Requires comparative runs.

**B. Ghost tracking integration status:**  
`ghost_tracker.py` is an UNTRACKED standalone file (595 lines) sitting at the repo root. It is **not integrated** into Lux-OB-Backtester. The spec at the top of the file explicitly states:
```
✗ first_failed_tag cancel  — not yet implemented in backtester
```
This means:
- No FFT cancel rows will have `ghost_candidate = True` in any current run output.
- `ghost_tracker_test.py` has unit tests but they test the standalone module, not the live pipeline.

**C. TE delay telemetry:** Cannot directly verify. Frontend imports these fields correctly from CSV if the backend exports them.

**D. Session/news filters:** Config serialization is correct. Behavioral correctness unverifiable without runs.

---

## 4. Export Schema Audit

### test_import_bundle
The `test_import_bundle` contains a full protection/penetration run. Primary CSV headers (trades_single_position.csv) were verified. This bundle has **no TE/FFT trades** — it predates triggered-edge work.

**Fields PRESENT in test_import_bundle trades CSV:**
cancel_reason, cancelled_before_entry, protection fields, fill_candle_index, exit_candle_index, entry_model_filled, missed_trade, close_breach fields, protection fields, bars/minutes_to_fill/exit — all present.

**Fields ABSENT from test_import_bundle (TE-only):**
`trigger_time`, `trigger_candle_index`, `tapped_before_trigger`, `tapped_time`, `tapped_candle_index`, `arm_candle_index`, `exited_ob_before_arm`, `ob_occupied_at_arm`, `armed_after_ob_exit`, `armed_at`, `fill_delay_candles`, `trigger_penetration_pct`, `entry_level_pct`, `ghost_candidate`, `ghost_outcome`, `ghost_r`, `ghost_*`

**`delay_candles_configured`** — this field from the audit scope **does not appear anywhere in the frontend codebase** (not in `importer.js`, `useResolvedScenario.js`, `StrategyMap.jsx`, or `CandleChart.jsx`). If the backend exports it, it is silently dropped on import.

### sample_run_bundle
Only 12-column toy CSV — no telemetry fields at all. Useful only for basic import smoke tests.

### summary.json ghost fields
`importer.js` lines 1235–1243 correctly reads all 9 ghost summary aggregates:
`ghost_candidates_total`, `ghost_wins`, `ghost_losses`, `ghost_breakevens`, `ghost_protection_exits`, `ghost_unfilled`, `ghost_never_triggered`, `ghost_net_r`, `ghost_avg_r` — with camelCase aliases.

---

## 5. Frontend Import Audit

**`importer.js`** — All audited TE/FFT/ghost fields are present:

| Audit-Required Field | importer.js key | Status |
|---|---|---|
| `cancel_reason` | `cancel_reason` + `cancelReason` | ✓ |
| `cancelled_before_entry` | both forms via `boolOrNull` | ✓ |
| `tapped_before_trigger` | both forms | ✓ |
| `tapped_time` / `tapped_candle_index` | both forms | ✓ |
| `trigger_time` / `trigger_candle_index` | both forms | ✓ |
| `fill_time` / `fill_candle_index` | both forms | ✓ |
| `arm_candle_index` | both forms | ✓ |
| `exited_ob_before_arm` | both forms | ✓ |
| `ob_occupied_at_arm` | both forms | ✓ |
| `armed_after_ob_exit` | both forms | ✓ |
| `ghost_candidate` through `ghost_fill_session` | both forms | ✓ |
| `ghost_mae`, `ghost_mfe`, `ghost_fill_delay_candles` | both forms (trades only) | ✓ |
| `delay_candles_configured` | **ABSENT** | ✗ |

**`obLifecycle.js`** — Does not handle `cancelled_before_entry` or `cancel_reason` as a distinct OB status. An OB cancelled by first_failed_tag (or any pre-entry cancel) will fall through to `"unknown"` unless `obFinalStatus` is set by the backend. If the backend sets `ob_final_status` the OB will display correctly; if it relies on trade fields only, the status will be wrong.

**`useResolvedScenario.js`** — passes through all cancel/ghost fields correctly to overlay objects. **Missing FFT debug fields** (see Critical Bug #1 below).

**`tradeUniverse.js`** — `selectTrades` handles d2/d3 correctly: falls through to `entryTradesByMode(bundle)` lookup by normalized key (e.g., `entry_triggered_edge_25p0_d2`). This works if the backend exports separate CSV files with the canonical key. If trades are combined in one file with the correct `entry_model_key` column value it also works via the filter path.

**Summary ghost fields** — imported correctly at lines 1235–1243 and passed through to `runSummary` then to `RunDetail.jsx` ghost KPI strip.

---

## 6. Scenario Selection Audit

**Uncommitted fixes are logically correct:**

| Component | Fix | Status |
|---|---|---|
| `ScenarioSelector.jsx` `fillModeDisplayLabel()` | "d2" → "Delay +2" | Correct, not committed |
| `ScenarioSelector.jsx` `buildViewingLabel()` | Uses `fillModeDisplayLabel()` for all modes | Correct, not committed |
| `tradeUniverse.js` `describeUniverseLabel()` | dm regex for d2/d3 | Correct, not committed |
| `useResolvedScenario.js` scenario label builder | dm regex for d2/d3 | Correct, not committed |

**Before these uncommitted fixes** were applied, any d2/d3 scenario would display as "Viewing: Triggered Edge 25% · Both" — wrong. After the fix it shows "Viewing: Triggered Edge 25% · Delay +2".

**Stale "Both" label risk:** The `resolvedFillMode == null` branch now correctly falls to `" · Both"` explicitly. The old code had `resolvedFillMode !== "same" && !== "next"` implicitly catching d2/d3 as "Both". This is now correct.

**Baseline** always resolves correctly (no threshold/fillMode = "Viewing: Baseline").

---

## 7 & 8. Strategy Map Truth + Cross-Check UI vs CSV

**No TE/FFT run data is available in the repo.** Specific OB-level cross-checks (first_failed_tag cancel row vs chart marker, ghost candidate vs CSV row, d2/d3 trade vs lifecycle panel) cannot be performed until a real run with these features is imported.

**What can be stated from code inspection:**

### Baseline scenario (no TE)
- Stats are derived from the actual selected trade list via `summarizeTradeClassifications()` — not from summary.json wins/losses. This is correct; the prior bug of showing summary.json's baseline stats for a non-baseline scenario is explicitly fixed.
- Trade count, net R, win rate: consistent with CSV if importer is correct (verified above).

### TE scenario selection
- Trades are correctly selected from `entryTradesByMode(bundle)` keyed by canonical entry model key.
- Source file label is correctly derived from bundle's `entryResults.sourceFiles`.

### First-failed-tag cancel rendering
The badge for an FFT cancel will show as **"PROTECTED" (grey)** instead of **"FAILED TAG" (pink)** because `useResolvedScenario.buildTriggeredEdgeOverlays` has no `first_failed` branch in its `badgeState` logic. See Critical Bug #1.

---

## CRITICAL BUGS

### BUG-1 (Critical): `useResolvedScenario.buildTriggeredEdgeOverlays` is missing all FFT debug fields and the `first_failed` badge branch

**Location:** `frontend/src/pages/strategyMap/useResolvedScenario.js`, function `buildTriggeredEdgeOverlays` (~line 247)

**Root cause:** `StrategyMap.jsx` defines its own `buildTriggeredEdgeOverlays` (line 1153) with full FFT fields. When FFT debug overlays were added (commit `bd8382e`), the function in `StrategyMap.jsx` was written correctly — but `StrategyMap` was already wired to consume `resolvedScenario.triggeredEdgeOverlays` from `useResolvedScenario.js` (line 376). The `StrategyMap.jsx` version is **dead code** (defined but never called). The live `useResolvedScenario` version was not updated.

**Fields missing from the LIVE overlay objects:**

| Missing Field | Used By | Effect |
|---|---|---|
| `isFftCancel` | `CandleChart.jsx:1225`, lifecycle panel | Pink FFT cancel dot never draws |
| `fftCancelTime` | `CandleChart.jsx:1226`, lifecycle panel | Tap→cancel line never draws |
| `tappedCandleIndex` | FFT debug checklist | Always shows "—" |
| `triggerCandleIndex` | FFT debug checklist | Always shows "—" |
| `armCandleIndex` | FFT debug checklist | Always shows "—" |
| `exitedObBeforeArm` | FFT debug checklist | Always shows "—" |
| `obOccupiedAtArm` | FFT debug checklist | Always shows "—" |
| `armedAfterObExit` | FFT debug checklist | Always shows "—" |
| `obExitTime` | FFT debug checklist | Always shows "—" |
| `ghostCandidate` (camelCase) | FFT checklist "Ghost candidate" row | Always shows "—" |
| `badgeState = "first_failed"` | badge rendering, checklist trigger | FFT cancels show as "PROTECTED" (inval) not "FAILED TAG" (pink) |

**Fix required:** Sync `useResolvedScenario.buildTriggeredEdgeOverlays` to match `StrategyMap.jsx`'s dead version. Specifically add: `isFftCancel`, `fftCancelTime`, `tappedCandleIndex`, `triggerCandleIndex`, `armCandleIndex`, `exitedObBeforeArm`, `obOccupiedAtArm`, `armedAfterObExit`, `obExitTime`, `ghostCandidate` (camelCase alongside existing `ghost_candidate`), and the `first_failed` branch in `badgeState` logic. Then delete the dead `StrategyMap.jsx` version.

---

### BUG-2 (Critical): FFT debug checklist never shows because `ov.isFftCancel` is always falsy

**Consequence of BUG-1.** The FFT debug checklist condition is:
```js
{showFftDebug && (ov.isFftCancel || ov.tappedBeforeTrigger || ov.badgeState === "first_failed")}
```
`isFftCancel` is always undefined. `badgeState === "first_failed"` is never set. The checklist only shows for rows where `tappedBeforeTrigger = true` — and even then all delay fields show "—". The checklist is effectively non-functional for its primary purpose.

---

## MEDIUM-RISK ISSUES

### MEDIUM-1: `delay_candles_configured` not imported

The audit scope lists `delay_candles_configured` as a required field. This field does not exist anywhere in the frontend codebase (`importer.js`, `useResolvedScenario.js`, `StrategyMap.jsx`, `CandleChart.jsx`). If the backend exports it, it is silently dropped.

**Action:** Determine if the backend actually exports this field. If yes, add it to `importer.js` `parseTradesCSV` and pass it through to overlay objects.

---

### MEDIUM-2: `ghost_tracker.py` is untracked and NOT integrated into backend

`ghost_tracker.py` (595 lines, with tests) sits at repo root, untracked. It is a standalone Python module that has never been integrated into Lux-OB-Backtester. Any run output will have null ghost fields. The frontend correctly handles this (all ghost fields default to null), but the ghost KPI strip on RunDetail will never show real data.

Additionally, `ghost_tracker.py` explicitly does not handle `first_failed_tag` cancels ("not yet implemented in backtester"). This means ghost tracking only covers retrace_cancel, news_blackout, and session_cancel even after integration.

**Action:** Integrate `ghost_tracker.py` into Lux-OB-Backtester before declaring ghost tracking functional. File should be committed and moved to the appropriate location.

---

### MEDIUM-3: `StrategyBuilder.jsx` hardcoded dataset date ceiling

`getDefaultDates()` uses `DATASET_MAX_DATE = "2026-05-18"` as the hardcoded `dateTo` ceiling. This was intentional with a TODO comment: `// TODO: replace DATASET_MAX_DATE with actual max candle timestamp from dataset metadata once the sidecar exposes a /datasets/:file/info endpoint.`

If the candle file is updated past this date, the default date range will silently under-use the available data. Not a data corruption issue, but a silent configuration risk.

---

### MEDIUM-4: `obLifecycle.js` does not recognize `cancelled_before_entry` as a distinct status

`deriveOBStatus` reads `ob.obFinalStatus` first (backend-set field), then falls through to outcome-based heuristics. It does not check `cancelled_before_entry` or `cancel_reason`. An OB cancelled before entry (retrace, FFT, news, session) will show as `"unknown"` in the baseline OB lifecycle view unless the backend sets `ob_final_status` correctly.

This only matters if OB-level views show these statuses. If the backend always sets `ob_final_status`, this is not a visible bug.

---

### MEDIUM-5: `tradeClassification.js` `buildDirStructMatrix` inline structure normalization

The committed diff replaces `normalizeStructure(trade)` (imported from sessionAnalytics) with inline logic:
```js
const struct = rawStruct === "BOS" ? "BOS" : rawStruct === "CHOCH" ? "CHoCH" : "Unknown";
```
Any structure value that is not exactly "BOS" or "CHOCH" (after `.toUpperCase()`) silently becomes "Unknown". This is a narrowing of the normalization. If the backend exports other variants (e.g., "bos", "BoS", "BOS_break", "INTERNAL_BOS"), the direction-structure matrix will bucket them as Unknown rather than the correct structure. Low risk if backend outputs are consistent.

---

## COSMETIC / UI CLARITY ISSUES

### COSMETIC-1: Cancel reason labels changed in uncommitted `tradeClassification.js`

The `displayCancelReason` function now maps:
- `INVALIDATED_BEFORE_EDGE_ENTRY` → "Invalidated Before Entry" (was "Protected before edge entry")
- `INVALID` / `INVALIDATED` → "Invalidated Before Entry" (was "Protected before edge entry")
- New: `FIRST_FAILED_TAG` → "First Failed Visit"
- New: `RETRACE_CANCEL` → "Move-Away / Retrace Cancel"
- New: `NEVER_TRIGGERED` → "Never Triggered"
- New: `NEVER_FILLED_AFTER_TRIGGER` → "Never Filled After Trigger"

These are correct spec-aligned labels. The change from "Protected before edge entry" to "Invalidated Before Entry" is a semantic clarification — worth noting for anyone comparing old screenshots to new.

### COSMETIC-2: `StrategyMap.jsx` dead `buildTriggeredEdgeOverlays` (line 1153)

This ~150-line function is dead code. It causes confusion for any future reader and is the root cause of BUG-1 going unnoticed. Should be deleted as part of BUG-1 fix.

---

## Files Inspected

- `frontend/src/data/importer.js` (full, ~1300 lines)
- `frontend/src/data/obLifecycle.js` (full)
- `frontend/src/data/tradeUniverse.js` (full, 806 lines)
- `frontend/src/data/tradeClassification.js` (diff + key sections)
- `frontend/src/data/sidecarClient.js` (full)
- `frontend/src/pages/strategyMap/useResolvedScenario.js` (full, 762 lines)
- `frontend/src/pages/strategyMap/ScenarioSelector.jsx` (diff + key sections)
- `frontend/src/pages/StrategyMap.jsx` (key sections, grep)
- `frontend/src/pages/StrategyBuilder.jsx` (config serialization block)
- `frontend/src/pages/RunDetail.jsx` (ghost KPI strip)
- `frontend/src/components/lab/CandleChart.jsx` (FFT overlay sections)
- `ghost_tracker.py` (header + key sections)
- `test_import_bundle/trades_single_position.csv` (headers)
- `test_import_bundle/config.json` (full)
- `test_import_bundle/summary.json` (grep)
- `sample_run_bundle/trades_single_position.csv` (headers)
- Git log + diff (all 11 modified files)

---

## 9. New Runs Required?

**Yes. The following runs are needed before making decisions about FFT / TE-delay validity.**

After BUG-1 is fixed, generate these runs from StrategyBuilder:

| Run Name | Config | Purpose |
|---|---|---|
| `baseline_fft_off_v1` | Entry model: Triggered Edge 25%, delays: [0,1], FFT OFF, same date range as last known good | Regression baseline — confirms TE delay doesn't alter non-FFT outcomes |
| `te25_fft_on_immediate_v1` | Same, FFT ON, delay: [0] only | Verify first_failed badge shows pink in UI, FFT checklist populates |
| `te25_fft_on_d2_v1` | Same, FFT ON, delays: [0, 1, 2] | Verify d2 scenario label, d2 trades selected, delay validity fields visible |
| `te25_fft_on_d3_v1` | Same, FFT ON, delays: [0, 1, 2, 3] | Verify d3 scenario label, d3 trades separate |
| `te25_retrace_cancel_v1` | FFT ON, retrace cancel ON (20 pips), same date range | Verify retrace cancel badge, ghost candidate field (once ghost_tracker integrated) |

All runs should use the same: symbol, date range, RR, sessions, news config as your last production run to allow clean comparison.

---

## 10. Recommended Fixes — Priority Order

### P1 — Fix before any FFT analysis
**Fix BUG-1: Sync `useResolvedScenario.buildTriggeredEdgeOverlays` to include all FFT debug fields.**

In `useResolvedScenario.js`, `buildTriggeredEdgeOverlays` (~line 247), add to each overlay object:
```js
isFftCancel,          // = normalizeOutcome(cancelReason).includes("first_failed")
fftCancelTime,        // = isFftCancel ? firstAvailable(trade.exit_time, trade.exitTime, trade.exit) : null
tappedCandleIndex:    numericOrNull(trade.tapped_candle_index ?? trade.tappedCandleIndex),
triggerCandleIndex:   numericOrNull(trade.trigger_candle_index ?? trade.triggerCandleIndex),
armCandleIndex:       numericOrNull(trade.arm_candle_index ?? trade.armCandleIndex),
exitedObBeforeArm:    trade.exited_ob_before_arm ?? trade.exitedObBeforeArm ?? null,
obOccupiedAtArm:      trade.ob_occupied_at_arm ?? trade.obOccupiedAtArm ?? null,
armedAfterObExit:     trade.armed_after_ob_exit ?? trade.armedAfterObExit ?? null,
obExitTime:           firstAvailable(trade.ob_exit_time, trade.obExitTime) || null,
ghostCandidate:       trade.ghost_candidate ?? trade.ghostCandidate ?? null,
```
And add the `first_failed` branch to `badgeState` logic (before the `inval` branch):
```js
} else if (cancelledBeforeEntry && cancelNorm.includes("first_failed")) {
    badgeState = "first_failed";
```
Then delete `buildTriggeredEdgeOverlays` from `StrategyMap.jsx` (dead code, line 1153–1292).

### P2 — Commit clean working changes
Commit the 11 modified files. They are individually correct:
- d2/d3 label rendering (ScenarioSelector, tradeUniverse, useResolvedScenario)
- cancel reason labels (tradeClassification)
- scenario-correct OB time1 (useResolvedScenario)
- StrategyBuilder date ceiling (low risk, already has TODO comment)

### P3 — Investigate `delay_candles_configured`
Check whether Lux-OB-Backtester exports `delay_candles_configured` in the trades CSV. If yes, add to `importer.js` `parseTradesCSV` and pass through in overlay objects.

### P4 — Commit `ghost_tracker.py` and integrate into Lux-OB-Backtester
Move `ghost_tracker.py` out of the repo root to its correct integration location. Add it to git. Follow the integration spec in `ghost_tracker.py`'s docstring and `LUX-GHOST-PHASE-1-integration.md`.

### P5 — Generate new comparison runs (see section 9)
After P1 is done, generate the five runs listed in section 9 and re-import to verify:
- Pink FAILED TAG badge appears for FFT cancels
- FFT debug checklist shows real values (not all "—")
- d2/d3 scenario labels correct
- Trade counts match CSV
- Ghost candidate rows have `ghost_candidate = true` and populated ghost fields

### P6 (optional) — Add `delay_candles_configured` guard to `validateCsvHeaders`
Add `delay_candles_configured` to the warnings group in `validateCsvHeaders` for `trades_` files so missing TE fields produce a visible warning on import.

---

## Suggested Commit Plan

```
commit 1: fix(strategy-map): sync useResolvedScenario overlay builder with FFT debug fields
  - useResolvedScenario.js: add isFftCancel, fftCancelTime, candle index fields, ghostCandidate, first_failed badgeState
  - StrategyMap.jsx: delete dead buildTriggeredEdgeOverlays function

commit 2: chore: commit clean working changes from codex-dev session
  - ScenarioSelector.jsx, tradeUniverse.js, useResolvedScenario.js: d2/d3 labels
  - tradeClassification.js: cancel reason labels + struct matrix fix
  - StrategyBuilder.jsx: date ceiling with TODO
  - SessionLabV1 UI fixes
  - App.js, Sidebar.jsx, IntrabarInspector.jsx minor

commit 3: feat(ghost): move ghost_tracker.py to backend, integrate into backtester
  - pending backend integration work
```
