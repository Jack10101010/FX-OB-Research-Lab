# Protection Lab Freeze — Root-Cause Investigation (round 2)

**Repo:** FX-OB-Research-Lab. **Investigation only — no fixes.**
Why round 1's guard didn't help, and where the freeze actually is.

## Why Fix #1 had no effect (the key finding)

Two facts make the round-1 guard a no-op for this run:

1. **BreakevenTab only mounts on the `breakeven` tab.** `ProtectionLab.jsx:640` renders it inside
   `{protTab === "breakeven" && …}`; the default tab is `"overview"` (`ProtectionLab.jsx:106-107`). So all
   the BreakevenTab gating I added never executes unless that sub-tab is open.

2. **The guard's inputs are wrong for the *load* decision.** `BreakevenTab.jsx:802-806`:
   `replayBlocked = activeRun.largeRun || activeRun.lazy || candles.length > 50000`.
   - `candles.length` is **0 before the load** — the cap can never pre-empt the load that *creates* the
     candle array. It's circular: it only becomes true *after* the expensive load already ran.
   - So the only thing that could block the load up-front is the **`lazy`/`largeRun` flags** — and this run
     evidently doesn't carry them (a run only gets `lazy:true`/`largeRun:true` when the `/bundle` endpoint
     **413s**, `store.js:2614/2623/2718`; an eager import that deferred candles another way is **not**
     flagged). With flags absent and `candles.length === 0`, `replayBlocked` is **false at mount**, the
     `if (replayBlocked) return` at `:813` is skipped, and `loadCandlesForRun(activeRunId)` runs the full
     load anyway — identical to before.

The guard *should* have keyed off the run-level candle **metadata** that exists before loading
(`candleCount` / `candlesMeta`, present at `store.js:1125/1411/2442`), not the post-load `candles.length`.

## Where the freeze actually is — ranked

### #1 — Synchronous full-candle load + JSON parse (most likely)
- **File / path:** `BreakevenTab.jsx:815` → `store.loadCandlesForRun` (`store.js:2854/2900-2943`, default
  path, **no cap**) → `sidecarClient.getRunCandlesByRunId` → `JSON.parse` of the full candle response
  (`sidecarClient.js:14`) + array materialisation.
- **Complexity:** O(N) over **~2.4M candle rows** for the 6.4y M1 run — a single multi-hundred-MB
  `JSON.parse` plus object construction, **synchronous on the main thread**. Right-click dies; the tab is
  frozen before any replay even starts.
- **Why it freezes large runs / survived the fix:** the load is gated by `replayBlocked`, which is `false`
  at mount (flags absent, `candles.length===0`), so the load proceeds. This is the "briefly works after
  refresh, then freezes" pattern: the effect fires after mount, the parse lands, the thread locks.
- **Requires:** being on the **breakeven** sub-tab (where BreakevenTab mounts). Confirm this first.

### #2 — BE replay over the full candle set × 9 arms (compounding, mostly post-load)
- **File:** `BreakevenTab.jsx:947-948` `replayBeScenario(trades, candles, …)` inside `ARM_LEVELS.map`
  (9 arms), each rebuilding a 2.4M-entry index (`beReplay.js:104-160, 399-416`).
- **Complexity:** 9 × O(candles). Now usually blocked *after* the load (once `candles.length > 50000`,
  `replayBlocked` flips true on the next render and `canReplay` is false), so #1's load is the dominant
  freeze. It still runs if the run is small enough to dodge the cap but large enough to hurt, or on the tick
  between load completion and the cap taking effect.
- **Why large runs:** candle-walk cost scales directly with candle count × arms.

### #3 — If the freeze is on the OVERVIEW tab: notify-amplified protection builders (needs confirmation)
- **File:** `ProtectionLab.jsx:110-175` (`buildProtection`, `buildBreachTiming`, `buildExactProtectionRows`,
  `buildWhatIfSimulation`, `buildPairedTrades`, `normalizeProtectionTradesByMode`) over `trades` /
  `activeRun.protectionResults`.
- **Complexity:** these are **trade-scale** (~hundreds–thousands of rows), so individually cheap. The only
  way they freeze is if they **re-run on a tight notify loop** (every store `notify()` rebuilds them, and
  background loaders — OB loader `store.js:2678/2685`, lazy entry/BE fetches — each `notify()`), or if a
  selected variant's `protectionResults` is unexpectedly large. Lower probability and not catastrophic on
  its own; included because overview is the default tab and #1/#2 don't apply there.

## Determinations requested

- **What's executing at freeze:** almost certainly the synchronous candle load/parse (#1) inside
  BreakevenTab's candle effect — *if* the breakeven tab is open. It is **inside an effect** (post-mount,
  post-commit), which matches "renders, then freezes."
- **Is the replay guard preventing replay?** For *replay* (#2): yes, once candles exceed the cap. For the
  *candle load* (#1): **no** — the guard doesn't gate the load on pre-load metadata, and the run lacks the
  `lazy/largeRun` flags, so the load runs.
- **Another panel doing similar work?** No other Protection Lab panel loads candles or replays:
  `loadCandlesForRun`/`replayBeScenario` appear only in BreakevenTab within this page (BeVerificationPanel
  uses candles only for a small chart; overview/deepdive/research panels are trade-scale).
- **Before render / during render / in an effect?** In an **effect** (the candle-load effect, and the
  replay effect) — not in the render pass and not before mount.

## Decisive next step — 4-line instrumentation (you run, 1 reload)

Add temporarily near the top of `BreakevenTab` body and in the candle effect; reload, open Protection Lab,
watch the console just before it locks:

```js
// at top of BreakevenTab({...}) body:
console.log("[BE] tab mount", { lazy: activeRun?.lazy, largeRun: activeRun?.largeRun,
  candleCount: activeRun?.candleCount ?? activeRun?.candlesMeta?.size, loadedLen: candles?.length, replayBlocked });
// wrap the load call (BreakevenTab.jsx:815):
console.time("[BE] loadCandlesForRun"); loadCandlesForRun(activeRunId).then(()=>console.timeEnd("[BE] loadCandlesForRun"))…
// wrap the replay compute (BreakevenTab.jsx:903 compute()):
console.time("[BE] replay×9"); /* …compute… */ console.timeEnd("[BE] replay×9");
```
Interpretation: if it hangs after `[BE] loadCandlesForRun` starts and never prints `timeEnd` → **#1
(parse)**. If `loadCandlesForRun` finishes fast but `[BE] replay×9` never ends → **#2**. If the freeze
happens with the `overview` tab active (BreakevenTab never logs "tab mount") → **#3**, and we instrument
`ProtectionLab` builders next. Also confirm `replayBlocked`/`lazy`/`largeRun` in the first log — if
`largeRun/lazy` are `false`, that confirms the guard-bypass mechanism above.

## Correct fix direction (for later — not done now)
Gate the **load** on pre-load run metadata, not the post-load array: e.g.
`replayBlocked = activeRun?.lazy || activeRun?.largeRun || (activeRun?.candleCount ?? activeRun?.candlesMeta?.size ?? 0) > CAP`,
and also confirm which tab the freeze occurs on before committing. (No change made — investigation only.)

*Investigation only. No code changed, nothing staged/committed/pushed.*
