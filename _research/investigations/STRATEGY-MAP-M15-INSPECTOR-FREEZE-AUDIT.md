# Strategy Map M15 View + Intrabar Inspector Freeze — Audit

**Mode:** Audit only. No code changed.

---

## TL;DR

- **M15 disappeared** because the timeframe selector was rewritten to show **only the aggregated
  bucket label** when display candles are aggregated: `displayTfOptions = aggBucketLabel ?
  [aggBucketLabel] : …`. For a large run `aggBucketLabel = "6h"`, so the list collapses to `["6h"]`
  and 1m/5m/15m are gone. (Intended to stop the misleading "15m" label — but it removed the option
  entirely.)
- **The inspector freezes for three compounding reasons:** (1) `computeOverlays()` runs **in
  MiniChart's render body**, so every drag/resize `setPosition`/`setSize` re-renders MiniChart and
  recomputes all overlays **per mousemove frame**; (2) `loadInspectorWindowCandles` calls
  **`notify()`**, which hands StrategyMap a new `bundle`, rebuilds `triggeredEdgeOverlays`, gives the
  fetch effect's `inspectorWindowRange` **a new object identity**, and **re-triggers the window
  fetch** → the "popped back to loading" flicker; (3) the window has **no hard size cap**, so a trade
  with a distant candidate timestamp can request a multi-day 1m window.

---

## 1. Timeframe selector — why M15 vanished

`StrategyMap.jsx` ~318–328:
```js
const candlesAreCoarse = medianCandleGapSec >= 900;
const displayTfOptions = useMemo(() => (
    aggBucketLabel ? [aggBucketLabel] : (candlesAreCoarse ? ["15m"] : ["1m", "5m", "15m"])
), [aggBucketLabel, candlesAreCoarse]);
```
When the overview is server-aggregated, `aggBucketLabel` (e.g. `"6h"`) is truthy, so the option list
is `["6h"]` — **M15 is removed**. The effect at ~711 then forces `displayTf` to `displayTfOptions[0]`
("6h"). The aggregated 6h candles also make `candlesAreCoarse = true`, so even without
`aggBucketLabel` the only option would be `["15m"]` and `resampleCandlesForDisplay` is skipped. The
overview genuinely cannot offer 1m/5m/15m because it only holds the 6h `displayCandles` — there are
no fine rows in memory to resample.

**Expected behaviour:**
- **Overview:** 6h aggregated for the full multi-year history (keep).
- **Detection-timeframe (M15):** only viable if loaded safely — see §5/§7. Full-history M15 on a
  6-year run is ~**210k** bars (6·365·24·4), too many to render smoothly and the current endpoint
  would re-aggregate it to 6h at `max_points=12000` anyway. So M15 full-history should be **gated**.
- **Intrabar:** 1m local window only (the inspector) — already the right idea, but unbounded (§3).

## 2. Inspector fetch — why drag/resize reloads

The fetch effect (`StrategyMap.jsx` ~776–784) depends on **`inspectorWindowRange`**, an **object**:
```js
const inspectorWindowRange = useMemo(() => ({ start, end }), [selectedTrade, selectedTriggeredEdge]);
useEffect(() => { …loadInspectorWindowCandles… }, [runId, inspectorWindowRange]);
```
- `selectedTriggeredEdge` is memoized on `triggeredEdgeOverlays`, which is rebuilt by
  `useResolvedScenario` whenever `bundle` changes identity.
- **`loadInspectorWindowCandles` calls `notify()` on success** (`store.js` ~2983). `notify()`
  re-renders StrategyMap; `getRunData(runId)` returns a **new `bundle`** (the run object was replaced
  to add `intrabarCandlesByWindow`); `useResolvedScenario` recomputes → `triggeredEdgeOverlays`
  rebuild → `selectedTriggeredEdge` new ref → **`inspectorWindowRange` is a new `{start,end}`
  object** → the effect's dependency changed → **the fetch runs again**.
- The 2nd run is a **cache hit** (no `notify`), so it converges — but every selection costs an extra
  full StrategyMap + overlay + inspector re-render, and during that cycle
  `inspectorWindow.candles.length` momentarily drops to 0, so `inspectorSourceCandles` falls back to
  the 6h `sourceCandles` and `inspectorSourceIsFine` flips false → **"1m unavailable" / "loading"
  flicker**. Any additional re-render that touches `bundle` (a store `notify` from elsewhere, or an
  overlay rebuild) re-arms the same cycle. The **object-in-dep-array** is the core defect: the effect
  should key off **stable primitives** (`start`, `end` numbers), and the success path should **not**
  `notify()` into the very memo it depends on.
- Drag/resize themselves are inspector-local `setState` (`setPosition`/`setSize`) and do **not**
  directly re-run the parent effect — but they make the **inspector re-render every frame**, which is
  expensive for a different reason (§4), and any coincident `notify()` re-arms the refetch.

## 3. Window-size — unbounded

`inspectorWindowRange` = `[min … max]` over `triggerTime, tappedTime, armedAtTime, fillTime, exitTime,
obExitTime, trigger_time, entry, exit, armed_at` **± 2h**, with **no maximum-duration clamp**
(`StrategyMap.jsx` ~762–773). For the sample C50 trade the window is ~4.9h → **292 1m rows** (fine).
But there is no guard: if any candidate is far from the others — e.g. an OB `detectionTime` days
earlier, an `obExitTime` long after, or a malformed/epoch-0 timestamp — `min`/`max` can span **days or
weeks**, requesting tens of thousands of 1m rows. The endpoint reads the **whole 2.4M-row file** per
call and filters by range (`read_candles_file`), so a big window is also a big server scan. **No
hard cap = latent multi-day fetch + heavy render.**

## 4. Rendering — the main-thread freeze

`MiniChart` (IntrabarInspector ~715–847):
- **`computeOverlays(...)` is called directly in the render body** (~833), **not** in `useMemo`. It
  reads chart/series coordinates (price→pixel etc.) and builds all overlay geometry. It therefore
  runs **on every render**.
- During drag, the parent inspector calls **`setPosition` on every mousemove** (~265); during resize,
  **`setSize`** (~311). Each re-renders `IntrabarInspector` → its child `MiniChart` (not
  `React.memo`) re-renders → **`computeOverlays` runs every frame** → main-thread freeze.
- `subscribeVisibleTimeRangeChange(repaint)` (~772) bumps `overlayKey` on every pan/zoom → another
  re-render + `computeOverlays`. `series.setData(...) + fitContent()` run on `[candles]` change
  (fine), but combined with a large/unbounded window (§3) the `setData` itself is heavy.
- There is **no virtualization/downsampling** inside the inspector: every 1m candle is sent to
  lightweight-charts and every overlay recomputed. At ~300 rows it's tolerable; at thousands
  (unbounded window) it stalls.

**Freeze cause = per-frame `computeOverlays` in render body + unmemoized MiniChart re-rendering on
every drag/resize mousemove, amplified by an unbounded window and the notify-driven refetch.**

## Files implicated

| File | What |
|---|---|
| `frontend/src/pages/StrategyMap.jsx` ~318–328 | `displayTfOptions` collapses to `[aggBucketLabel]` → M15 gone |
| `frontend/src/pages/StrategyMap.jsx` ~762–784 | `inspectorWindowRange` object dep; no size cap; effect re-fires |
| `frontend/src/data/store.js` ~2952–2992 (`loadInspectorWindowCandles`) | `notify()` on success → bundle churn → refetch cycle |
| `frontend/src/components/lab/IntrabarInspector.jsx` ~833 (`computeOverlays` in render body), ~715 (MiniChart not memoized), ~255–340 (drag/resize `setState` per mousemove) | per-frame recompute → freeze |
| `Lux-OB-Backtester/sidecar/server.py` `read_candles_file` | range read scans whole file (fine for a *capped* window; bad for an unbounded one) |

## 5. Correct design (recommended)

**A. Overview** — keep aggregated 6h for the multi-year full view.

**B. Detection-timeframe (M15)** — make M15 a **distinct, gated** option, not part of the aggregated
overview list:
- Show M15 **only when it's safe**: e.g. when the run's span yields ≤ ~15–20k 15m bars (roughly ≤
  ~200 trading days). Otherwise render the M15 button **disabled** with a tooltip ("M15 full history
  too large for this multi-year run — use the 1m inspector on a trade").
- Implementation options: request `aggregate=ohlc&max_points=…` tuned so the chosen ladder interval
  *is* 15m for shorter runs (the ladder already contains 15m); or add a **forced-bucket** param
  (`bucket=15m`) for that case; or offer **"M15 around the selected trade"** (a windowed M15 fetch),
  which is always bounded.
- **Do not** load 210k raw 15m rows for a 6-year run — see the explicit recommendation below.

**C. Intrabar inspector** — 1m window only, **bounded and stable**:
- **Hard-cap the window**: clamp duration to a sane max (e.g. ≤ 6–12h → ≤ ~360–720 1m rows); center
  on `trigger→fill→exit` and pad symmetrically; if the raw span exceeds the cap, clip to the
  trade-centric core (trigger…fill…exit) rather than the outermost candidate.
- **Stable cache key**: key the effect on **primitive `start`/`end` numbers**, not the
  `{start,end}` object; round to the minute so identical windows reuse the cache.
- **No `notify()` feedback into the window memo**: either don't `notify()` for inspector-window
  writes (store under a slot the resolved-scenario memo doesn't read — it already is
  `intrabarCandlesByWindow`, so the memo just shouldn't re-key off the whole `bundle`), or derive
  `inspectorWindowRange` from `selectedTradeId` + stable trade-time primitives so a `bundle` identity
  change doesn't churn it.
- **No refetch/recompute on drag/resize**: wrap `MiniChart` in `React.memo`; move `computeOverlays`
  into a `useMemo`/effect keyed on `[candles, levels, events, chartHeight, overlayKey]` (not the
  panel position); position/size changes must not re-run candle layout.
- **Cap rows inside the inspector** too (defensive): if a window somehow returns > N rows, slice to
  the trade-centric N before `setData`.
- Show **window duration + row count** in the header; overlay trigger/arm/fill/exit (already present).

## Should M15 full-history be allowed on 6-year runs? **No.**
~210k 15m bars is too many to fetch raw and render smoothly, and the current endpoint would
re-aggregate to 6h at `max_points=12000` anyway (so it wouldn't even be "M15"). Allow M15 only when
the bar count is under a cap (short runs), otherwise **disable the option** (with a tooltip) and rely
on the **1m inspector window** (or an optional "M15 around the selected trade" window) for fine detail.

## 6. Fix ranking

| Priority | Fix | Scope | Risk |
|---|---|---|---|
| **Emergency** | Stop the freeze + reload: (a) `React.memo(MiniChart)` + move `computeOverlays` into `useMemo` keyed on data/overlayKey (not position); (b) key the fetch effect on primitive `start`/`end` (rounded) and **remove the `notify()`-driven refetch** (depend on `selectedTradeId` + trade-time primitives); (c) **hard-cap the window** duration + row count. | FE only (`IntrabarInspector.jsx`, `StrategyMap.jsx`, `store.js`) | Low |
| **Next** | Restore a sensible **M15 option**: enable it only when bar count ≤ cap (short runs); else disabled-with-tooltip; or "M15 around trade". | FE (+ maybe a `bucket=` param backend) | Low–Med |
| **Later** | Backend **indexed/seek range read** so windowed fetches don't scan the whole 2.4M-row file. | Backend | Med |

## Validation plan (for when implemented)
1. Drag/resize the inspector → **no refetch** (network idle), **no "loading" flicker**, smooth (no
   per-frame overlay recompute; verify via Performance long-tasks).
2. Select a trade → exactly **one** window fetch; re-selecting the same trade → **cache hit, no
   fetch**; `start`/`end` stable across re-renders.
3. Window is **bounded**: log duration + row count for several trades (incl. one with a distant OB
   detection time) → always ≤ cap (e.g. ≤ ~720 1m rows); no multi-day request.
4. C50 trade renders continuous 1m candles with trigger/arm/fill/exit overlays; header shows window
   duration + row count.
5. M15: short run shows a working M15 option; 6-year run shows M15 **disabled** with tooltip; overview
   stays 6h.
6. OB Retest / Breakeven still use full-resolution candles; overview perf unchanged; eslint + existing
   suites pass.

*No code was changed. Audit only.*
