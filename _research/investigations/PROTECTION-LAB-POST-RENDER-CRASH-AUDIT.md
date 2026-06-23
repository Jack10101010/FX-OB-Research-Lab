# Protection Lab — post-render crash (BE-present run) — audit

**Repo:** FX-OB-Research-Lab. **Audit only — no edits.** The no-BE guard works; this run HAS BE, so it passes
the guard and crashes *after* a correct first render. File: `src/components/lab/protection/BreakevenTab.jsx`.

## What runs after the initial render (inventory)
- **Replay builder effect** (`:957-1023`) — deferred via `requestIdleCallback(compute,{timeout:1500})`
  (`:1014`). `compute` maps over **all 9 `ARM_LEVELS`** (`:982`) and, for each arm with no EXACT, calls
  `replayBeScenario(trades, candles, …)` (`:1002`). Deps: `[trades, candles, …, beResultsMap,
  beTradesByModeMap, …, replayBlocked, hasAnyBeScenario]` (`:1023`).
- **Candle-load effect** (`:850-894`) — for a BE run (`hasAnyBeScenario`, not `replayBlocked`) it calls
  `loadCandlesForRun(activeRunId)`; on completion the store notifies and `candles` propagates.
- **Lazy-BE-scenario loader** `useLazyBeScenario(activeRunId, activeRun, {…})` (`:903-906`) — loads the
  SELECTED scenario's rows on demand; on completion merges into the store → notify.
- **Console diagnostic effect** (`:911-943`) — `console.groupCollapsed` + `console.info({…15 fields…})` on
  every change of `[…, beResultsMap, beTradesByModeMap, …, beLazyStatus.loading, beLazyStatus.error]`.
- **Large memos** that recompute on selection/state change: `selectiveBe` (`:1093`), `globalBeUniverse`
  (`:1108`), `cohortAttribution` (`:1118`), `explorerRows` (`:1122`), `globalAttribution` (`:1132`),
  `beCompare` (`:1144`).

## Key fact driving the crash
`beResultsMap`/`beTradesByModeMap` are derived from `activeRun.beResults`/`activeRun.beTradesByMode`
(`:708-709`). `activeRun` = `runs[activeRunId]`, which gets a **new object reference on every store
notify**. So **any** notify (candle load, lazy-BE merge) gives these new refs → the **replay effect and the
console effect both re-fire**.

---

## Ranked likely causes

### #1 — PRIMARY: replay runs `replayBeScenario` over the full candle set for ALL non-EXACT arms, once candles load
`BreakevenTab.jsx:982-1008` + `beReplay.js:399-416` (`replayBeScenario` → `buildReplayCandleIndex(candles)`
per call, `:406`).
- The run has EXACT for **only the 0.25 arm**, so `resolveBeScenarioSource` returns **REPLAY for the other 8
  arms** → `compute()` runs **8× `replayBeScenario` over the whole candle set**, each rebuilding a candle
  index (Map over every candle) + per-trade walks.
- It only runs once **candles are present** (`canReplay = avail.available && !replayBlocked`, `:968`). That's
  why it's **delayed**: first paint shows EXACT 0.25 with `noCandles=true` (the 8 arms return `summary:null`,
  `:1007`); then the candle-load effect (`:850`) loads candles → `candles` dep changes → effect re-fires →
  `canReplay=true` → the 8× candle walk runs inside the idle callback ~1.5 s later → "Page Unresponsive".
- **`replayBlocked` does NOT catch this run** — it only blocks **large/lazy** runs (`activeRun.largeRun ||
  lazy || candleCount/size > caps`). A mid-size BE run (candle file < 25 MB, < 50 k rows) has
  `replayBlocked=false`, so the 8× replay runs. The earlier FREEZE-FIX only covered large/lazy; a moderate
  BE run is exactly the gap.
- 8 full-candle index builds + walks per pass is the synchronous CPU hang → `RESULT_CODE_HUNG`.

### #2 — COMPOUNDING: the replay effect re-fires multiple times (candle load + lazy-BE merge → ref churn)
`:708-709` (maps track `activeRun`), `:903-906` (lazy-BE load), `:1023` (deps include `candles`,
`beTradesByModeMap`).
- Selecting 0.25 triggers `useLazyBeScenario` → loads that scenario's rows → store notify → new
  `activeRun.beTradesByMode` ref → new `beTradesByModeMap` → replay effect re-fires.
- The candle-load completion is a **separate** notify → `candles` ref change → another re-fire.
- So the 8× replay can run **2–3+ times** within seconds (candle-load fire + lazy-merge fire + any further
  notify), turning one heavy pass into a compounding series → the "gradually sluggish over 5–10 s, then
  crash" profile (not a single instantaneous freeze).

### #3 — MEMORY amplifier: console diagnostic logs a large object on every churn
`:911-943` (`console.info({…})`), deps include `beResultsMap, beTradesByModeMap, beLazyStatus.*` (`:943`).
- Each notify-driven re-fire logs a 15-field object (with arrays like `beResultsScenarioKeys`,
  `beTradesScenarioKeys`). With DevTools open these are **retained** (console keeps references) → steady
  memory growth across the repeated re-fires in #2 → pushes an already-strained tab into `HUNG`/`Aw, Snap`.
  Not the CPU hang itself, but a real OOM amplifier, and it fires on exactly the same churn as #1/#2.

### #4 — Per-call candle-index rebuild (no reuse across arms)
`beReplay.js:406` — `replayBeScenario` builds `buildReplayCandleIndex(candles)` **internally, once per call**.
Inside `ARM_LEVELS.map` that's **8 full-candle Map builds per pass** (×N passes from #2). Pure waste: the
index is identical across arms. Big transient allocations → GC pressure contributing to the hang.

### #5 — LOWER: downstream memo/render cascade on each re-fire
`setScenarios(null)`→`setScenarios(result)` (`:976`, `:1009`) repaints the 9-row table and re-evaluates
`selectiveBe`/`globalBeUniverse`/`explorerRows`/attribution (`:1093-1132`) over the trade set each cycle.
Minor next to the candle walk, but it rides the same re-fire loop and adds per-cycle cost.

---

## Most likely cause (one line)
**#1 + #2:** once candles load, the replay builder walks the full candle set **8× (every non-EXACT arm)**,
and re-fires several times as the candle-load and lazy-BE-scenario notifies change `candles`/`beTradesByModeMap`
refs — so a BE-present, *non*-large run that the `replayBlocked` guard doesn't cover hangs the tab a few
seconds after the correct EXACT-0.25 render (#3/#4 add memory pressure → `Aw, Snap`).

## Fix direction (for a later change — NOT implemented)
1. **Don't REPLAY arms that have no EXACT when the run already has EXACT BE** — show only the EXACT arm(s) and
   mark the rest "not exported / EXACT only" (the `:1007` branch already exists for the no-candle case;
   extend it so non-EXACT arms never candle-walk on a run that has any EXACT). Removes the 8× replay.
2. **Or** replay only the **selected** arm, not all 9.
3. **Hoist `buildReplayCandleIndex(candles)` out of the per-arm loop** (build once, pass in) — addresses #4.
4. **Stabilize the effect deps** (memoize `beResultsMap`/`beTradesByModeMap` by content, not by `activeRun`
   ref) so notifies don't re-fire the builder — addresses #2.
5. **Gate/remove the `console.info` diagnostic** (or `console.debug` behind a flag) — addresses #3.
6. Optionally lower the replay candle cap so moderate runs are covered, independent of large/lazy.

*Audit only. No code changed, nothing staged/committed/pushed.*
