# TE/FFT Validation Readiness Audit
**Date:** 2026-06-05  
**Branch:** `codex-dev`  
**Follows:** FULL-PIPELINE-INTEGRITY-AUDIT-1.md + FFT-OVERLAY-SYNC-PLAN.md + FFT overlay sync implementation

---

## Part 1 — P1 Blocker Status

### BUG-1 (Critical): `useResolvedScenario.buildTriggeredEdgeOverlays` missing FFT fields + `first_failed` branch

**Status: RESOLVED ✓**

All three edits from the plan are confirmed in the live file (lines 316–393):

| Change | Location | Verified |
|---|---|---|
| `isFftCancel` + `fftCancelTime` locals | line 316–319 | ✓ |
| `first_failed` badgeState branch (before `inval`) | line 334–335 | ✓ |
| 11 FFT debug fields in `out.push({...})` | lines 383–393 | ✓ |

**Dead function removal:** `StrategyMap.jsx` has zero occurrences of `buildTriggeredEdgeOverlays`. The function (formerly lines 1153–1295) is gone. The single remaining definition + call site are both in `useResolvedScenario.js` (lines 247 and 603).

### BUG-2 (Critical): FFT debug checklist condition never fires

**Status: RESOLVED ✓**

The checklist gate is:
```js
{showFftDebug && (ov.isFftCancel || ov.tappedBeforeTrigger || ov.badgeState === "first_failed")}
```
Both `ov.isFftCancel` (line 383) and `ov.badgeState === "first_failed"` (line 334–335) are now produced by the live builder. The checklist will fire for any FFT-cancelled overlay when the FFT Debug layer is on.

---

## Part 2 — Consumer Field Audit

Six consumers read from the live `triggeredEdgeOverlays` array or individual overlay objects:

### Consumer 1: `CandleChart.jsx` (badge chips)
**Fields read:** `badgeState`, `cancelledBeforeEntry`, `obId`, `tradeId`  
**Status:** All produced. `badgeState = "first_failed"` maps to label "FAILED TAG" / pink chip via `BADGE_LABELS` / `BADGE_COLORS` at line 1089–1096. ✓

### Consumer 2: `CandleChart.jsx` (ghost badge chips)
**Fields read:** `ghost_candidate` (snake_case), `ghost_outcome`, `ghost_r`, `obId`, `tradeId`  
**Status:** All produced. Note: ghost badges depend on `ghost_candidate === true` which requires ghost tracking to be integrated in the backtester. Currently `ghost_tracker.py` is untracked and not integrated — ghost badges will not appear on any current run output. ✓ (functionally correct, data not yet available)

### Consumer 3: `CandleChart.jsx` (FFT debug markers / dots / lines / threshold lines)
**Fields read:** `isFftCancel`, `fftCancelTime`, `fftMoveAwayPipsAtCancel`, `tappedTime`, `direction`, `obTop`, `obBot`, `cancelledBeforeEntry`, `badgeState`, `obId`, `tradeId`  
**Status:** All produced. ✓

### Consumer 4: `StrategyMap.jsx` `LifecycleDetailPanel` (ghost simulation block)
**Fields read:** `ghost_candidate` (snake_case), `ghost_outcome`, `ghost_r`  
**Status:** All produced. ✓

### Consumer 5: `StrategyMap.jsx` `LifecycleDetailPanel` (FFT debug checklist)
**Fields read:** `isFftCancel`, `tappedBeforeTrigger`, `badgeState`, `fftMoveAwayPipsAtCancel`, `tappedTime`, `triggerPenetrationPct`, `triggerTime`, `cancelReason`, `cancelledBeforeEntry`, `wasTriggered`, `fftCancelTime`, `ghostCandidate` (camelCase), `tappedCandleIndex`, `triggerCandleIndex`, `armCandleIndex`, `exitedObBeforeArm`, `obOccupiedAtArm`, `armedAfterObExit`, `obExitTime`  
**Status:** All produced. ✓

### Consumer 6: `IntrabarInspector.jsx` (header + event timeline)
**Fields read:** `badgeState`, `cancelReason`, `direction`, `obId`, `obTop`, `obBot`, `triggerPrice`, `triggerPenetrationPct`, `entryPrice`, `detectionTime`, `tappedTime`, `triggerTime`, `armedAt`, `edgeRevisitTime`, `retraceCancelTime`  
**Status:** All produced. ✓  
**Minor cosmetic note:** IntrabarInspector does `String(badgeState).toUpperCase()` instead of mapping through `BADGE_LABELS`. For `first_failed`, this renders "FIRST_FAILED" in the header title bar rather than "FAILED TAG". Functionally correct; cosmetically inconsistent with CandleChart. Low priority, not a blocker.

### Consumers NOT reading from `triggeredEdgeOverlays`
These were flagged by grep but operate on raw trades, not overlay objects:

| File | What it does | Feed |
|---|---|---|
| `fftAnalytics.js` | `computeFftAnalytics()` — FFT cancel counts + ghost totals | Raw trades array |
| `FftProtectionPanel.jsx` | Renders FFT stats panel | `computeFftAnalytics(trades)` |
| `sessionLabV1Adapter.js` | Session failure cards ("First Failed Tag") | Raw `sessionTrades` |
| `entryAnalytics.js` | Entry analytics per-model | Raw trades |
| `configRegistry.js` | Config field registry | Static definitions |

All of these are independent of the overlay sync fix.

### Complete field coverage summary

Every field any consumer reads from `triggeredEdgeOverlays` is produced by the live builder. **No consumer reads a field that is not produced.** No consumer reads `fftMoveAwayPipsAtCancel` without a null-guard.

---

## Part 3 — Remaining Known Issues (not fixed, not blockers for validation runs)

| Issue | Risk | Notes |
|---|---|---|
| `delay_candles_configured` absent from `importer.js` | Low | Backend may or may not export this field. Silent drop on import. |
| `ghost_tracker.py` untracked, not integrated in backtester | Medium | Ghost fields will be null in all current run output. Ghost badges, ghost simulation panel, ghost KPI strip will not show. |
| `obLifecycle.js` doesn't recognize `cancelled_before_entry` | Low | Affects baseline OB lifecycle view. Backend may set `ob_final_status` correctly which would bypass this. |
| `IntrabarInspector` cosmetic: "FIRST_FAILED" vs "FAILED TAG" | Cosmetic | Header title text inconsistency. Not a data or functional bug. |
| `StrategyBuilder.jsx` hardcoded `DATASET_MAX_DATE = "2026-05-18"` | Low | Silently truncates runs if candle data extends beyond this date. |
| Pre-existing uncommitted changes (11 files) not yet committed | Admin | d2/d3 labels, OB time1 fix, cancel reason labels, SessionLabV1 UI — correct but unstaged. |

---

## Part 4 — Five-Run Validation Checklist

> **Pre-condition for all five runs:** FFT overlay sync committed, frontend rebuilt and served (`npm start` or dev server refreshed), run import completed into local store.

---

### Run 1: `baseline_fft_off_v1`
**Config:** Triggered Edge 25%, delay=[0,1], `triggered_edge_cancel_on_first_failed_tag=false`, retrace cancel off. Same symbol, date range, RR, sessions, news as reference run.

#### CSV fields that must exist
- `entry_model_key` present on all TE trades (values: `entry_triggered_edge_25p0`, `entry_triggered_edge_25p0_d1`)
- `cancel_reason` — expected values: `INVALIDATED_BEFORE_EDGE_ENTRY`, `RETRACE_CANCEL`, `NEVER_TRIGGERED`, or blank for filled trades
- `cancelled_before_entry` — `True` only for retrace/inval cancels; `False` for filled trades
- No rows should have `cancel_reason = first_failed_tag` (FFT is off)
- `trigger_time` populated on triggered OBs; blank on never-triggered
- `tapped_time`, `tapped_before_trigger` should be blank/False (no FFT events)
- `ghost_candidate` — all False/blank (ghost not integrated)

#### UI elements that should change vs baseline
- Scenario selector shows "Triggered Edge 25%" and "Triggered Edge 25% · Next" scenarios
- Badge chips on chart: `never_trig` (grey), `inval` (violet PROTECTED), `used_ob` (pink RETRACE), `same`/`next` (green/cyan)
- **No pink "FAILED TAG" chips** — FFT is off, none expected
- Lifecycle panel: "Cancelled before entry" = false for all filled trades, "Cancel reason" blank or inval/retrace values

#### Evidence of correct behavior
1. Trade count in UI (TradeSanityStrip) matches row count in each scenario's CSV file (filter by `entry_model_key`)
2. No `first_failed` badge state appears anywhere on the chart
3. OBs with `cancel_reason = INVALIDATED_BEFORE_EDGE_ENTRY` show violet "PROTECTED" badge
4. Win rate and net R in scenario strip match manual calculation from CSV

#### Failure signatures
| Symptom | Likely cause |
|---|---|
| Pink "FAILED TAG" chips appear despite FFT off | `cancelNorm.includes("first_failed")` is matching something unexpected; check `cancel_reason` values in CSV |
| All badge states null (no chips at all) | `entry_model_key` not starting with `"entry_triggered_edge"` — import key mismatch |
| Scenario selector shows only "Baseline" | Bundle has no `entryResults` keyed by TE key — bundle structure mismatch |
| "PROTECTED" chips for never-triggered OBs | `cancelledBeforeEntry = True` on never-triggered rows (backend bug); should be `False` |

---

### Run 2: `te25_fft_on_immediate_v1`
**Config:** Same as Run 1 but `triggered_edge_cancel_on_first_failed_tag=true`, `triggered_edge_fft_move_away_pips=0`, `triggered_edge_fft_move_away_ob_multiple=0` (immediate mode — cancel fires the moment price taps OB entry side).

#### CSV fields that must exist
All Run 1 fields, plus:
- `cancel_reason = first_failed_tag` on all FFT-cancelled rows
- `cancelled_before_entry = True` on FFT-cancelled rows
- `tapped_before_trigger` — `True` on FFT-cancelled rows (price hit entry side before trigger threshold)
- `tapped_time` — populated on FFT-cancelled rows (time of first OB tap)
- `tapped_candle_index` — integer on FFT-cancelled rows
- `arm_candle_index` — integer (should NOT exist in immediate mode — arm logic is irrelevant if FFT fires on first tap; verify what backend exports)
- `exited_ob_before_arm`, `ob_occupied_at_arm`, `armed_after_ob_exit` — check what backend exports for immediate-mode cancels
- `fft_move_away_pips_at_cancel = 0` (immediate mode: cancel at entry edge, zero move-away)
- `exit_time` — populated (used as `fftCancelTime` proxy)

#### UI elements that should change vs Run 1
- **Pink "FAILED TAG" chips** appear on FFT-cancelled OBs (not violet "PROTECTED")
- FFT debug layer enabled: **pink cancel dot** appears on each FFT-cancelled OB at the entry edge (y = `obTop` for bull, `obBot` for bear)
- FFT debug layer enabled: **indigo TAP dot** appears at `tappedTime` on the entry edge
- FFT debug layer enabled: **horizontal pink line** drawn from TAP x → cancel x along the entry edge
- In lifecycle panel (select an FFT-cancelled OB and enable FFT Debug layer): all checklist rows should populate with real values instead of "—"
  - "FFT cancel time" shows `exit_time` value (proxy), plus note "using exit_time as proxy"
  - "Ghost candidate" shows false (ghost not integrated)
  - "tapped_before_trigger" shows true
  - "tapped_candle_index" shows integer
- **Trade count** for TE 25% scenario should be **lower** than Run 1 (FFT cancels removed from filled trade universe)

#### Evidence of correct behavior
1. Count of rows with `cancel_reason = first_failed_tag` in CSV equals count of "FAILED TAG" chips on chart
2. Selecting a FAILED TAG chip opens lifecycle panel with `badgeState = "first_failed"` reflected in the pink header badge
3. FFT debug checklist: "FFT enabled in config" = YES, "tapped_before_trigger" = true, "Cancel reason" = first_failed_tag
4. No FAILED TAG OB has `wasTriggered = true` in lifecycle (trigger was not reached before cancel)
5. `fftMoveAwayPipsAtCancel` shows 0 in checklist (immediate mode)

#### Failure signatures
| Symptom | Likely cause |
|---|---|
| FFT-cancelled OBs show violet "PROTECTED" instead of pink "FAILED TAG" | `cancelNorm.includes("first_failed")` not matching — check exact `cancel_reason` string the backend exports. If it exports `"FIRST_FAILED_TAG_CANCEL"` rather than `"first_failed_tag"`, `normalizeOutcome` may not produce a string containing `"first_failed"` |
| Pink cancel dot missing on chart | `ov.isFftCancel` is false (cancel_reason not matching) OR `ov.fftCancelTime` is null (exit_time blank in CSV) |
| TAP dot missing | `ov.tappedTime` null — check `tapped_time` exported in CSV |
| TAP→cancel line missing | Either `tapX` or `cancelX` null — one of the two times did not resolve to a visible chart coordinate |
| Checklist shows all "—" | Still hitting old behavior — clear browser cache and confirm frontend is rebuilt |
| Trade count same as Run 1 | FFT cancel did not reduce filled trades — FFT may not be implemented in backtester yet |

---

### Run 3: `te25_fft_on_d2_v1`
**Config:** Same as Run 2, add delay=[2] to the delay list (so delays=[0,1,2]).

#### CSV fields that must exist
All Run 2 fields, plus:
- Separate scenario CSV keyed as `entry_triggered_edge_25p0_d2` OR trades with `entry_model_key = entry_triggered_edge_25p0_d2`
- `fill_delay_candles = 2` on filled d2 trades
- `filled_on_trigger_candle = False` on d2 trades (fill is 2 candles after trigger)

#### UI elements that should change vs Run 2
- **Scenario selector** shows "Triggered Edge 25% · Delay +2" — not "Triggered Edge 25% · Both"
- Selecting the d2 scenario loads only d2 trades (different count from d0/d1)
- Badge chips for d2 filled trades: `next` chip color (cyan) — but wait, d2 is neither "same" nor "next" (delay=1). Check: what badgeState does a d2 filled trade produce? In the live builder: `filledOnTriggerCandle = False` is the condition for `"next"`. d2 won't have `filledOnTriggerCandle = True`, and `filledOnNextCandle` checks `filled_on_trigger_candle === false` — so d2 filled trades will get `badgeState = "next"` (since `filledOnNextCandle` checks for `false` on `filled_on_trigger_candle`). This is technically a false label — "NEXT" implies delay=1. **See delay badge inconsistency note below.**
- `TradeSanityStrip` shows correct trade count for d2-only scenario

#### Evidence of correct behavior
1. Scenario label reads "Triggered Edge 25% · Delay +2" (not "Both")
2. Trade count for d2 scenario matches row count in d2-keyed CSV / filtered rows with `entry_model_key = entry_triggered_edge_25p0_d2`
3. Entering the d2 scenario shows the correct set of OBs highlighted on the chart

#### Failure signatures
| Symptom | Likely cause |
|---|---|
| Scenario shows "Triggered Edge 25% · Both" or "Triggered Edge 25% · " (blank suffix) | d2 label fix not committed / not in build |
| Scenario shows no trades | `entryTradesByMode` lookup fails — check that bundle key matches `entry_triggered_edge_25p0_d2` exactly |
| Trade count wrong | d2 and d0/d1 trades mixed in same CSV file rather than split by key |

**Delay badge inconsistency note:** The badgeState chain uses `filledOnTriggerCandle` (same) and `filledOnNextCandle` (which gates on `filled_on_trigger_candle = False`) to produce "same"/"next". For d2/d3, this will produce `badgeState = "next"` for any filled trade because `filled_on_trigger_candle` is False. The badge label will read "NEXT" when it should read "D+2". This is a pre-existing design gap, not a regression from the FFT sync. Note it for a future iteration.

---

### Run 4: `te25_fft_on_d3_v1`
**Config:** Same as Run 3, add delay=[3] to the delay list (delays=[0,1,2,3]).

#### CSV fields that must exist
Same as Run 3 but keyed as `entry_triggered_edge_25p0_d3`, `fill_delay_candles = 3`.

#### UI elements that should change vs Run 3
- Scenario selector shows "Triggered Edge 25% · Delay +3"
- d3 scenario selects its own distinct trade set

#### Evidence of correct behavior
Same pattern as Run 3. Scenario label, trade count, and OB highlighting must all be distinct from d2.

#### Failure signatures
Same pattern as Run 3 but for d3 key.

---

### Run 5: `te25_retrace_cancel_v1`
**Config:** FFT ON (immediate), retrace cancel ON (`triggered_edge_cancel_on_retrace=true`, `triggered_edge_cancel_retrace_pips=20`), same date range.

#### CSV fields that must exist
All Run 2 FFT fields, plus:
- `cancel_reason = RETRACE_CANCEL` on retrace-cancelled rows
- `retrace_cancel_time` — populated on retrace-cancelled rows (time the retrace threshold was hit)
- `cancelled_before_entry = True` on retrace-cancelled rows

#### UI elements that should change vs Run 2
- **Pink "RETRACE" chips** (`badgeState = "used_ob"`) appear on retrace-cancelled OBs — distinct from FFT "FAILED TAG" chips which also use pink but different label
- Lifecycle panel: "Cancel reason" = RETRACE_CANCEL, `retraceCancelTime` populated in event timeline
- **Lower trade count** than Run 1 (both FFT and retrace cancels now remove OBs)
- Ghost badges: `ghost_candidate` should be `True` on retrace-cancelled rows IF ghost tracking is integrated. Currently it won't be (ghost_tracker.py not in backtester). Document expected future state: `G:WIN`, `G:LOSS`, `G:BE` badges should appear below retrace chips when ghost tracking is live.

#### Evidence of correct behavior
1. Retrace-cancelled OBs have `badgeState = "used_ob"` and show pink "RETRACE" chip (not "FAILED TAG")
2. FFT-cancelled OBs in the same run show pink "FAILED TAG" chip — both cancel types coexist correctly
3. Lifecycle panel event timeline for a retrace-cancelled OB shows `retraceCancelTime` as an event entry
4. OB box line extends to `retraceCancelTime` (as `lineEndTime`) not beyond

#### Failure signatures
| Symptom | Likely cause |
|---|---|
| Retrace-cancelled OBs show "PROTECTED" (violet) not "RETRACE" (pink) | `retraceCancelTime` null or `cancelNorm.includes("retrace")` not matching — check exact `cancel_reason` string |
| Retrace-cancelled OBs show "FAILED TAG" (pink) | `cancelNorm.includes("first_failed")` is matching incorrectly — check `cancel_reason` string in CSV; the `first_failed` branch runs before `inval` but after `used_ob`, so retrace must be caught first |
| `used_ob` and `first_failed` swap on some rows | Both `retraceCancelTime` and `cancel_reason = first_failed_tag` set on same row — ambiguous backend output |
| No retrace cancels visible | Retrace cancel not yet implemented in backtester |

---

## Part 5 — Cross-Cutting Verification Steps (all runs)

After importing each run, run these checks regardless of run config:

1. **Trade count consistency:** For each scenario, `TradeSanityStrip` count = CSV row count (filtered by `entry_model_key`). Discrepancies indicate scenario selection bug or import dropping rows.

2. **badgeState completeness:** Every overlay object should have a non-null `badgeState`. Null means a filled trade that is neither `filledOnTriggerCandle` nor `filledOnNextCandle` — which could indicate d2/d3 badge gap (see Run 3 note).

3. **No dead-data artifacts:** Open browser console. Confirm no errors like "Cannot read property X of undefined" on overlay objects. All 11 new FFT fields default to null safely (no crash on missing data).

4. **FFT debug mode clean when layer is off:** When `showFftDebug = false`, no FFT dots, lines, or threshold lines should appear on the chart. Confirming the `if (!showFftDebug...)` guard fires.

5. **Scenario-correct OB right edge:** With the OB time1 fix (pre-existing uncommitted change), OB boxes should extend to the scenario's exit time, not the baseline trade's exit time. Verify on a trade whose scenario exit differs from baseline exit.

6. **No regressions on existing badges:** Retrace baseline (non-FFT) OBs must still show correct badges. Inval OBs must still show violet. Same/next fills must still show green/cyan.

---

## Summary

| Item | Status |
|---|---|
| P1 BUG-1 (missing FFT fields in live builder) | Resolved ✓ |
| P1 BUG-2 (FFT checklist condition never fires) | Resolved ✓ |
| Dead `buildTriggeredEdgeOverlays` in StrategyMap.jsx | Deleted ✓ |
| All consumer fields covered by live builder | Confirmed ✓ |
| ModelAnalysis `FftProtectionPanel` independence from overlays | Confirmed ✓ (reads raw trades) |
| Ghost tracking integration | Not resolved — separate P4 item |
| Pre-existing uncommitted changes | Not committed — separate P2 item |
| Validation runs generated | Not yet — pending P5 |

**Frontend is ready to validate FFT/TE runs.** Generate and import the five runs to confirm end-to-end behavior.
