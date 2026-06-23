# Restore M15 Window mode (stash cluster M3) — audit

**Repo:** FX-OB-Research-Lab frontend (+ Lux sidecar already done). **Audit only — nothing
edited/staged/committed/pushed.**

## TL;DR
The **backend forced-`bucket=15m` support and the sidecarClient param forwarding already exist** (in the working
tree). Only the **frontend consumer** is missing: store `loadM15WindowCandles` (cluster **S6c**) and the StrategyMap
M15 UI/state (cluster **M3**). Both are **additive** and restorable **without** touching lazy-shell rehydration,
auto-reload, run-state classification, RunDetail, or Entries Lab. The only real work is *adapting* the StrategyMap
`sourceCandles`/label derivation, because Option B already reshaped that area.

## 1. What stash cluster M3 changed
- **store.js (S6c):** `loadM15WindowCandles(runId, {start,end})` — fetches a bounded server-aggregated 15m window
  (`aggregate:"ohlc", bucket:"15m"`), caches per window in `run.m15Windows[`m15_${start}_${end}`]` with a
  `M15_WINDOW_INFLIGHT` de-dupe map. A cache slot **distinct** from `candles` (full-res), `displayCandles` (6h
  overview), and `intrabarCandlesByWindow` (1m inspector). Never loads full history.
- **StrategyMap.jsx (M3):** state `displayMode` ("overview"|"m15_window"), `m15Preset` ("6M"|"9M"|"1Y"|"trade"|"3M"),
  `m15Offset` (Prev/Next), `m15Window` ({candles,loading,error,key}); `runEndSec` + `{m15Start,m15End}` memos
  (minute/900-rounded primitive epoch seconds); a primitive-keyed fetch effect calling `loadM15WindowCandles`;
  `inM15Mode = displayMode==="m15_window" && m15Window.candles.length>0` driving `sourceCandles`; and the toolbar UI
  (`<Segment>` Overview/M15 + preset buttons + Prev/Next + "Loading M15…"/"N × 15m" pills), with the existing
  `<NeonSelect displayTf>` gated to overview mode.
- **sidecarClient params:** `bucket` forwarding (alongside `start`/`end`/`max_points`/`aggregate`).
- **sidecar/server.py:** forced-bucket branch + `aggregate_candles_to_label`.

## 2. Backend forced `bucket=15m` — **confirmed working** (WT, uncommitted)
`/candles?aggregate=ohlc&bucket=15m&start=&end=` →
- `read_candles_file` filters rows to `[start_ts, end_ts]` **first** (range-respecting; `server.py:840-852`).
- endpoint branch (`server.py:871-874`): `if aggregate=="ohlc" and bucket:` →
  `aggregate_candles_to_label(candles, bucket)` — "**EXPLICIT timeframe … no auto-upshift**" (`server.py:815-822`).
- returns `bucket_label="15m"`, `bucket_seconds=900`, `aggregated=true`, `source_count`, `returned_count`.
So it does exactly what M15 needs: forced 15m, range-bounded, no auto-upshift, labelled.

## 3. sidecarClient — **confirmed forwarding** (WT, uncommitted)
`getRunCandlesByRunId` sets `start`, `end`, `limit`, `max_points`, `aggregate`, **`bucket`** (`sidecarClient.js:88-95`).
No change needed.

## 4. store.js `loadM15WindowCandles` — **ABSENT (lost in rollback)**
grep `loadM15WindowCandles`/`m15Windows` = **0**. Must be restored (S6c). The sibling loaders from Option B
(`loadCandlesForRun` display branch, `loadInspectorWindowCandles`) are present and provide the exact pattern to copy.

## 5. Can M3 be restored cleanly? — **Yes**
S6c is an additive store function (own cache slot + inflight map) and M3 is StrategyMap-only UI/state. Neither
references `runHasPopulatedData`, `isUnhydratedLazyShell`, `autoReloadIndexedRunsFromSidecar`,
`reloadLazyRunFromManifest`, `indexOnly`, RunDetail, or Entries Lab. Same safety profile as M1/M2 (already shipped in
Option B). No coupling to the risky lazy cluster.

## 6. Smallest recommended implementation
**Files/functions**
- `store.js` — add `loadM15WindowCandles(runId,{start,end})` + `m15Windows` cache + `M15_WINDOW_INFLIGHT`
  (verbatim from stash S6c; modelled on the already-restored `loadInspectorWindowCandles`). Additive only.
- `StrategyMap.jsx` —
  1. import `loadM15WindowCandles`.
  2. add state `displayMode`/`m15Preset`/`m15Offset`/`m15Window`.
  3. **adapt** the Option-B `sourceCandles` block (see §"adapt" below).
  4. add `runEndSec` + `{m15Start,m15End}` memos + the M15 fetch effect (primitive-keyed).
  5. toolbar: `<Segment>` Overview/M15 + presets 6M/9M/1Y (+ optional "Around trade") + Prev/Next + status pills;
     gate `<NeonSelect displayTf>` on `displayMode==="overview"`.
- `sidecarClient.js`, `sidecar/server.py` — **no change** (already support it; keep).

**Behaviour:** default `displayMode="overview"` (unchanged); switching to M15 with default preset **1Y** fetches a
bounded 15m window; Prev/Next shift by whole windows; "Around trade" centres ±3 weeks on the selected trade;
`sourceCandles` = the 15m window while in M15 mode; the **inspector keeps its own independent 1m window fetch**
(unchanged). No full-history M15 load.

## What can be reused from stash vs what must be adapted
**Reuse verbatim:** S6c `loadM15WindowCandles`; the M3 state, `runEndSec`/`m15Start`/`m15End` memos, the fetch
effect, and the `<Segment>`/preset/Prev-Next toolbar JSX + status pills.

**Must adapt (because Option B already reshaped this area):**
1. **`sourceCandles` derivation** — Option B set `const sourceCandles = displayCandles_… : …`. M15 needs:
   rename that to `overviewCandles`, then `const inM15Mode = displayMode==="m15_window" && m15Window.candles.length>0;`
   and `const sourceCandles = inM15Mode ? m15Window.candles : overviewCandles;` (the stash's original M1 form, which I
   deliberately simplified out in Option B).
2. **`hasCandles`** — add `|| m15Window.candles.length > 0`.
3. **`aggBucketLabel`** — Option B: `displayMeta?.aggregated ? bucketLabel : ""`. M15: `inM15Mode ? "15m" :
   (displayMeta?.aggregated ? bucketLabel : "")`.
4. **`candlesDownsampled`** — gate off in M15 mode: `!inM15Mode && (Boolean(displayMeta?.aggregated) || len>=cap)`
   (15m window isn't a "downsample" of itself).
5. **`displayTfOptions`** — already `aggBucketLabel`-aware from Option B; with `aggBucketLabel="15m"` it yields
   `["15m"]`, and the TF control is hidden in M15 mode anyway.
6. **Inspector wiring (M2)** — **no adaptation**; it already prefers its own 1m fetch and only falls back to
   `sourceCandles` (which in M15 mode is 15m → inspector shows "unavailable" only if the 1m fetch fails, exactly as
   today in overview/6h mode).

## 7. Risk assessment
- **Fetch size / memory:** 15m bars over a preset → 6M ≈ 17.5k, 9M ≈ 26k, **1Y ≈ 35k** candles (vs the 12k overview
  cap). 35k OHLC bars render fine in lightweight-charts; the JSON payload is a few MB. **Default 1Y is acceptable**;
  if you want smaller first paint, default **6M** and let users widen. (M15 windows are *not* `max_points`-capped —
  forced bucket returns every 15m bar in range by design.)
- **Cache key:** `run.m15Windows[`m15_${start}_${end}`]` with minute/900-aligned bounds → stable keys; Prev/Next and
  preset switches reuse cached windows; inflight map prevents duplicate fetches. Distinct slot, no eviction needed at
  these sizes.
- **Interaction with 6h overview:** separate cache slot; toggling back to Overview reuses the cached `displayCandles`
  (no refetch). `sourceCandles` simply switches source by `displayMode`.
- **Interaction with IntrabarInspector:** independent — inspector reads `inspectorSourceCandles` (its own 1m window).
  In M15 mode `candlesAreCoarse` is true (15m≥900s), so if the 1m fetch fails the inspector correctly reports
  unavailable; on success it shows true 1m. No regression.
- **Edge:** `runEndSec` derives the anchor from `bundle.displayCandles[last].time` else `config.end_date`; if neither
  exists (no overview loaded yet), the preset memo returns null → effect no-ops and the M15 pill shows nothing until
  overview lands. Acceptable; optionally anchor on `candlesMeta` end if present.

## Implementation plan (ordered, each buildable)
1. **store.js** — add `loadM15WindowCandles` + `m15Windows` cache + `M15_WINDOW_INFLIGHT` (additive; no lazy-cluster
   lines).
2. **StrategyMap.jsx** — state + `runEndSec`/`m15Start`/`m15End` memos + M15 fetch effect.
3. **StrategyMap.jsx** — adapt `sourceCandles`/`hasCandles`/`aggBucketLabel`/`candlesDownsampled` per §"adapt".
4. **StrategyMap.jsx** — toolbar `<Segment>` + presets + Prev/Next + pills; gate `displayTf` select to overview.
5. Keep sidecarClient + server.py as-is.

## Validation plan
1. esbuild bundle `StrategyMap.jsx` (pulls store.js) → EXIT 0.
2. `py_compile sidecar/server.py` (unchanged) → OK.
3. store.js diff adds **no** lazy-cluster/run-state lines (`runHasPopulatedData`/`isUnhydratedLazyShell`/`autoReload…`
   /`reloadLazyRunFromManifest`/`indexOnly`).
4. Confirm M15 fetch calls `loadM15WindowCandles` → `getRunCandlesByRunId(…, {start,end,aggregate:"ohlc",bucket:"15m"})`
   (forced 15m, no `max_points`).
5. Confirm Overview path unchanged (`aggregate:"ohlc", maxPoints` 6h) and inspector path unchanged (1m, no aggregate).
6. Live: toggle M15 → bounded window loads, pill shows "15m" + "N × 15m"; Prev/Next shift windows (cache reused);
   Around-trade centres on selection; Overview toggle returns to cached 6h with no refetch; inspector still fetches
   its own 1m window.
7. Confirm RunDetail/EntriesWorkspace untouched; no M15 full-history fetch (network shows bounded ranges only).

*Audit only. No code changes; stash intact; nothing staged/committed/pushed.*
