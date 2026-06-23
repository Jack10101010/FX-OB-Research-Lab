# FFT Overlay Sync — Implementation Plan

**Scope:** sync the live overlay builder in `useResolvedScenario.js` with the missing FFT/TE-delay fields; add `first_failed` badge branch; delete the dead builder in `StrategyMap.jsx`. No other changes.

---

## Files read

| File | Lines inspected |
|---|---|
| `frontend/src/pages/strategyMap/useResolvedScenario.js` | 1–99 (utilities), 247–379 (live builder), 584–586 (call site), 725–762 (return shape) |
| `frontend/src/pages/StrategyMap.jsx` | 370–376 (wiring), 1153–1295 (dead builder), 1936–2221 (lifecycle panel) |
| `frontend/src/components/lab/CandleChart.jsx` | 1080–1256 (badge shapes, ghost badges, FFT debug markers) |

---

## 1. Which function is live

**`useResolvedScenario.js` line 584:**
```js
const triggeredEdgeOverlays = useMemo(() => (
    buildTriggeredEdgeOverlays(trades, orderBlocks)
), [trades, orderBlocks]);
```
This calls the private `buildTriggeredEdgeOverlays` defined at **line 247** of the same file. It is returned by the hook at line 738 and consumed by `StrategyMap.jsx` at line 376:
```js
const triggeredEdgeOverlays = isDirectionalMode ? [] : resolvedScenario.triggeredEdgeOverlays;
```

**`StrategyMap.jsx` `buildTriggeredEdgeOverlays` (line 1153)** is defined but never called anywhere in the file. It is dead code.

---

## 2. Complete field inventory

### Fields the live function already outputs (useResolvedScenario.js lines 337–376)

```
tradeId, obId, direction, entryModelKey, triggerPenetrationPct, entryLevelPct,
triggerTime, detectionTime, lineStartTime, lineEndTime, wasTriggered, wasCancelled,
triggerLineState, tappedTime, armedAt, edgeRevisitTime, retraceCancelTime,
triggerToEntryMinutes, cancelReason, cancelledBeforeEntry, tappedBeforeTrigger,
sameCandleEntryAllowed, armedOnTriggerCandle, filledOnTriggerCandle,
obTop, obBot, obStartTime, obEndTime, triggerPrice, entryPrice, badgeState,
ghost_candidate, ghost_outcome, ghost_r, ghost_fill_session, ghost_fill_delay_candles
```

### Fields the dead StrategyMap.jsx function outputs that the live one does NOT

| Field | Dead code line | Consumer and why it matters |
|---|---|---|
| `isFftCancel` | 1281 | CandleChart 1225: gates the pink FFT cancel dot. Lifecycle panel 2152: gates the FFT debug checklist. Lifecycle panel 2156/2189: "Trigger before cancel?" logic. |
| `fftCancelTime` | 1282 | CandleChart 1225–1226: X-position of cancel dot. Lifecycle panel 2190: checklist row "FFT cancel time". |
| `tappedCandleIndex` | 1283 | Lifecycle panel 2192: checklist row. |
| `triggerCandleIndex` | 1284 | Lifecycle panel 2193: checklist row. |
| `armCandleIndex` | 1285 | Lifecycle panel 2194: checklist row. |
| `exitedObBeforeArm` | 1286 | Lifecycle panel 2195: checklist row. |
| `obOccupiedAtArm` | 1287 | Lifecycle panel 2196: checklist row. |
| `armedAfterObExit` | 1288 | Lifecycle panel 2197: checklist row. |
| `obExitTime` | 1289 | Lifecycle panel 2198: checklist row. |
| `ghostCandidate` (camelCase) | 1290 | Lifecycle panel 2191: checklist row "Ghost candidate". (Note: `ghost_candidate` snake_case is already in live function and is used by CandleChart ghost badge + narrative. Both names are needed.) |
| `fftMoveAwayPipsAtCancel` | 1291 | Lifecycle panel 2171: checklist row "Move-away at cancel". |

### badgeState branch missing from live function

The live function's `badgeState` chain (lines 325–336) is:
```
never_trig → used_ob → inval → same → next
```
The dead function's chain (lines 1235–1246) is:
```
never_trig → used_ob → first_failed → inval → same → next
```
The `first_failed` branch is missing. Without it, an FFT cancel (`cancelledBeforeEntry=true`, `cancelNorm.includes("first_failed")`) falls through to `inval`, producing a violet PROTECTED badge instead of the pink FAILED TAG badge.

---

## 3. Exact changes required

### Change A — `useResolvedScenario.js`: add two derived locals before the `out.push()`

**Location:** after `const cancelNorm = normalizeOutcome(cancelReason);` (live function line 315), add:

```js
const isFftCancel = cancelNorm.includes("first_failed");
const fftCancelTime = isFftCancel
    ? firstAvailable(trade.exit_time, trade.exitTime, trade.exit)
    : null;
```

These are the same expressions used in the dead StrategyMap function at lines 1216–1220.

### Change B — `useResolvedScenario.js`: add `first_failed` branch to `badgeState` chain

**Location:** in the `badgeState` chain (live function lines 325–336), between the `used_ob` branch and the `inval` branch. Currently:

```js
        } else if ((retraceCancelTime && String(retraceCancelTime).trim()) || cancelNorm.includes("retrace")) {
            badgeState = "used_ob";
        } else if (cancelledBeforeEntry && (cancelNorm.includes("inval") || ...)) {
            badgeState = "inval";
```

Insert one branch:
```js
        } else if (cancelledBeforeEntry && cancelNorm.includes("first_failed")) {
            badgeState = "first_failed";
```

### Change C — `useResolvedScenario.js`: add 11 fields to the `out.push({...})` object

**Location:** in the `out.push({...})` block (live function, after `badgeState,` at line 368), after the existing ghost fields block (currently ending at line 375), add:

```js
            // ── FFT debug fields ─────────────────────────────────────────────
            isFftCancel,
            fftCancelTime,
            tappedCandleIndex:       numericOrNull(trade.tapped_candle_index ?? trade.tappedCandleIndex),
            triggerCandleIndex:      numericOrNull(trade.trigger_candle_index ?? trade.triggerCandleIndex),
            armCandleIndex:          numericOrNull(trade.arm_candle_index ?? trade.armCandleIndex),
            exitedObBeforeArm:       trade.exited_ob_before_arm ?? trade.exitedObBeforeArm ?? null,
            obOccupiedAtArm:         trade.ob_occupied_at_arm ?? trade.obOccupiedAtArm ?? null,
            armedAfterObExit:        trade.armed_after_ob_exit ?? trade.armedAfterObExit ?? null,
            obExitTime:              firstAvailable(trade.ob_exit_time, trade.obExitTime) || null,
            ghostCandidate:          trade.ghost_candidate ?? trade.ghostCandidate ?? null,
            fftMoveAwayPipsAtCancel: numericOrNull(trade.fft_move_away_pips_at_cancel ?? trade.fftMoveAwayPipsAtCancel),
```

No existing fields change. This is a pure additive block appended inside the existing `out.push({...})`.

### Change D — `StrategyMap.jsx`: delete the dead function

**Location:** `StrategyMap.jsx` lines **1153–1295** (the entire `function buildTriggeredEdgeOverlays(...)` block, including its closing `}` and the blank line before `function buildStrategyMapNewsEvents`).

Delete exactly lines 1153–1295. The function `buildStrategyMapNewsEvents` that follows at line 1297 is unaffected.

---

## 4. Verification after implementation

After the changes, the overlay objects produced by the live function will contain every field the dead function produced. Check:

1. **`badgeState`** — a trade with `cancel_reason = "first_failed_tag"` should produce `badgeState = "first_failed"`. Previously it produced `badgeState = "inval"`.
2. **`isFftCancel`** — same trade should have `isFftCancel = true`.
3. **`fftCancelTime`** — same trade should equal its `exit_time`.
4. **CandleChart badge** — the pink "FAILED TAG" chip should appear on FFT-cancelled OBs instead of the violet "PROTECTED" chip.
5. **FFT debug checklist** — when FFT Debug layer is on and a tapped/FFT-cancelled overlay is selected, all rows should show real values instead of "—".
6. No change to any baseline or non-FFT overlay behavior.

---

## 5. What is NOT changing

- All existing logic in `useResolvedScenario.js` above or below the `out.push({...})` block.
- All other usages of `triggeredEdgeOverlays` in `StrategyMap.jsx` (badge rendering at line 376, `hasGhostData` at line 395, lifecycle panel call at line 635).
- `CandleChart.jsx` — no changes.
- `obLifecycle.js`, `importer.js`, `tradeUniverse.js`, `ScenarioSelector.jsx` — no changes.
- The scenario-correct OB time1 fix, d2/d3 label fixes, and other uncommitted changes in the working tree — untouched.
