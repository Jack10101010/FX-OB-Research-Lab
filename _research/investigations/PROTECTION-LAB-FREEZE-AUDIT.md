# Audit — App-wide Freeze / Protection Lab Hang

**Repo:** FX-OB-Research-Lab. **Audit only — no code changed.**

## Verdict
The freeze is **caused by Protection Lab** but the **symptom is app-wide** (single main thread blocked →
right-click dead, every page frozen). It is **not** a notify/render storm — it is **one giant synchronous
computation**: BreakevenTab replays break-even across **all 9 arm levels over the full-resolution candle set
(up to ~2.4M candles for the 6.4y M1 run), rebuilding a 2.4M-entry candle index 9×**, on the main thread,
and it **re-fires** every time the store notifies. Strategy Map was already capped (commit 399ccc5); Protection
Lab still feeds the **uncapped full** candle array into the replay.

---

## Ranked root-cause hypotheses (with evidence)

### #1 — PRIMARY: BreakevenTab BE-replay over full candles × 9 arms, no large-run guard
`frontend/src/components/lab/protection/BreakevenTab.jsx:890-946` — effect runs
`ARM_LEVELS.map(arm => … replayBeScenario(trades, candles, …))`.
- `ARM_LEVELS = BE_ARM_LEVEL_CHOICES` = **9 levels** (`configTranslator.js:488`: `[0.25,0.5,0.75,1,1.5,2,2.5,3,3.5]`).
- Each `replayBeScenario` (`frontend/src/data/beReplay.js:399-416`) calls
  `buildReplayCandleIndex(candles)` (`beReplay.js:104-160`) which builds a `Map` + ordered array over **every
  candle** (O(N)), then `[...trades].sort()`, then `replayBeTrade` per trade (`beReplay.js:225-300`, walks a
  candle slice). → **9 full index builds + 9 sorts + 9× per-trade candle walks** per run.
- **No cap and no `largeRun`/`lazy` guard.** The only gate is `avail.available && !hasExact`
  (`BreakevenTab.jsx:892-897`). `candles` is the raw full array (see #2), so for a 2.4M-candle run this is
  tens of millions of synchronous ops.
- It is wrapped in `requestIdleCallback(compute,{timeout:1500})` (`:937-939`) — that only **defers one tick**;
  once `compute` runs it is an uninterruptible synchronous long task → "briefly works after refresh, then
  freezes."
- **Why a lazy run guarantees the freeze:** for a lazy/large run the BE trade rows are deferred
  (`beResultsMap`/`beTradesByModeMap` start empty), so `resolveBeScenarioSource` returns **REPLAY for every
  arm** (`BreakevenTab.jsx:911-928`) → the full 9× candle walk instead of cheap EXACT lookups.

### #2 — CONTRIBUTING: Protection Lab loads the FULL candle set, uncapped
- `frontend/src/pages/ProtectionLab.jsx:100` — `candles = useMemo(()=> CANDLES, [CANDLES])`, passed to
  `<BreakevenTab candles={candles}/>` (`:666`). `CANDLES` is the run's full-resolution `run.candles`.
- `BreakevenTab.jsx:793-827` — on `noCandles` it calls `loadCandlesForRun(activeRunId)` with **no display
  option**, hitting the **full path** `store.js:2900-2943`, which stores **all** rows in `run.candles`
  (`candleCount: candles.length`, no cap). For the 6.4y run that is a ~2.4M-row CSV **parse on the main
  thread** (a multi-second freeze by itself) followed by #1.
- Contrast: the display/aggregated path (`store.js:2858-2898`, `displayCandles`) IS capped — but Protection
  Lab never uses it; it deliberately wants full-resolution for replay.

### #3 — AMPLIFIER: the replay effect re-fires on every store notify → repeated freezes
`BreakevenTab.jsx:946` deps `[trades, candles, triggerBasis, hasExact, beEntryVariantKey, beResultsMap,
beTradesByModeMap, beExecutionMode]`. Several change **identity** on each `notify()` after refresh:
- background order_blocks loader `store.js:2678` / `:2685` calls `notify()` (new `state.runs[runId]` ref);
- lazy BE scenario fetch (`useLazyBeScenario`, `BreakevenTab.jsx:836`) resolves → new `beTradesByModeMap`;
- candle load (#2) → new `candles` ref.
Each refire = another **9× full-candle replay** → "works, then freezes again," repeatedly.

### #4 — MINOR (not the freeze): verbose console diagnostics
`BreakevenTab.jsx:844-876` — `console.groupCollapsed` + `console.info({…})` of a rich object on every
selection/result change. Not the hang, but it inflates DevTools memory and adds overhead during the storm;
worth silencing.

**Ruled out:** the dirty store changes (`reloadLazyRunFromManifest`, `loadInspectorWindowCandles`,
`loadM15WindowCandles`) are Strategy-Map/Inspector-scoped and their cache mutations are deliberately
**non-reactive** (no `notify()` — see `store.js` comments at the inspector/M15 window writers). They are not
the Protection Lab freeze. The background OB loader's `notify()` only contributes by re-triggering #1/#3.

---

## Current state when it freezes
- Active run is the large 6.4y EURUSD run imported as **lazy / `largeRun:true` / `storageMode:"lazy_manifest"`**
  (`store.js:2613-2649`), BE rows deferred, candles deferred (`candlesLazy:true`).
- Opening **Protection Lab → Break-even** triggers full candle load (#2) then the 9-arm REPLAY (#1) because
  EXACT isn't resident yet (#1 lazy path).
- In memory: 9 arm levels × full candle index over ~2.4M candles, rebuilt per notify.

---

## Immediate workarounds (no code)
1. **Don't open Protection Lab on the large/lazy run.** Select a small run first; Protection Lab is safe there.
2. **If already frozen:** the synchronous task can't be interrupted — close the tab (browser "Wait" won't
   help) and reopen; on reload **navigate away from Protection Lab immediately** (the freeze needs the full
   candle load + replay, which only Protection Lab triggers).
3. **Keep candles unloaded:** avoid the Break-even sub-tab specifically — that effect is what loads full
   candles and runs the replay.
4. **Use an EXACT-BE, non-lazy run** (smaller run that imported fully): EXACT lookups skip the candle walk
   entirely, so no freeze.
5. Optionally clear the persisted active-run pointer (localStorage key `LS_ACTIVE`) so refresh doesn't
   auto-restore the large run into Protection Lab.

---

## Smallest safe fix plan (for a later change — not done here)
Ranked by effort/impact:
1. **Guard the replay for large/lazy runs (smallest, ~5 lines).** In `BreakevenTab.jsx:890-946`, bail to
   EXACT-only when `activeRun?.largeRun || activeRun?.lazy || candles.length > CAP` (e.g. 50k): set
   `scenarios` from EXACT and render a "REPLAY disabled for large runs — showing EXACT BE only" note instead
   of walking millions of candles. Stops the freeze outright.
2. **Build the candle index once, not per arm.** Hoist `buildReplayCandleIndex(candles)` out of the
   `ARM_LEVELS.map` and pass the prebuilt index into `replayBeScenario` (add an optional `candleIndex` param
   in `beReplay.js:399`). Turns 9 index builds into 1 (≈9× less work) even when replay is allowed.
3. **Don't auto-load full candles in Protection Lab for large runs.** Gate `loadCandlesForRun(activeRunId)`
   at `BreakevenTab.jsx:815` behind `!largeRun`, or request a bounded/aggregated set; rely on EXACT BE.
4. **Move replay off the main thread** (Web Worker) for the allowed small-run case, so even mid-size runs
   never block input.
5. **Stabilize the effect deps** so it doesn't refire on unrelated notifies (memoize `beResultsMap`/
   `beTradesByModeMap` by content, not identity), removing the repeated-freeze amplifier (#3).
6. Silence/level-gate the `console` diagnostic (#4).

Fix #1 alone makes the app usable again; #2/#3 remove the remaining cost for runs where replay is still
wanted. None require touching the Strategy-Map/Inspector dirty changes.

*Audit only. No code changed, nothing staged/committed/pushed.*
