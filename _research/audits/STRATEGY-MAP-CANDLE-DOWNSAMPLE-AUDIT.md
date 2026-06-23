# Strategy Map Candle Downsample Renders Broken — Audit + Fix Plan

**Mode:** Audit + fix plan only. No code changed.
**Runs:** `22cdd55d…` / `86c11cdc…` (each ~2.4 M 1-minute candles / 147 MB).

---

## TL;DR

**Striding is confirmed.** The sidecar downsamples by **row-striding** — `candles[::step][:limit]`
(server.py ~759–761) — so `limit=12000` returns **every ~200th raw 1-minute candle** and throws away
the 199 candles between each sample. Each returned bar still spans only **1 minute**, but they're now
plotted **~200 minutes apart** at their true timestamps, and the high/low of everything in between is
gone. The chart draws thin 1-minute bars separated by huge empty gaps → the "random disconnected
dots / specks." It is not a chart bug; it's the wrong downsample method (point-sampling instead of
OHLC aggregation).

There is also a **second, latent bug**: the downsampled candles are written into the **shared**
`run.candles` cache, which full-resolution consumers (OB Retest, Breakeven verification) read back —
so opening the Strategy Map first can **poison** their candles with the sparse display set.

Fix = **backend OHLC bucket aggregation** for the display path (Option B), plus a small frontend
guard so display-downsampled candles never satisfy full-resolution callers.

---

## Root cause

**1. Point-sampling instead of OHLC aggregation (primary).**
`read_candles_file` (server.py ~729–762) reads every row, then for `limit`:
```python
step = max(1, len(candles) // limit)
candles = candles[::step][:limit]
```
For 2.4 M rows, `step = 200`. The result is 12,000 **untouched 1-minute** candles sampled every 200
minutes. What this destroys:
- **Missing highs/lows:** the extreme of each 200-minute span is almost never the sampled minute, so
  the visible range collapses and bodies look tiny/random.
- **Gaps:** consecutive kept candles are 200 minutes apart in time but 1 minute wide → the chart
  renders isolated specks with empty space between them (a continuous candle series expects adjacent,
  same-width buckets).
- **Marker misalignment:** trade/OB markers carry 1-minute timestamps that mostly fall in the *gaps*
  between sampled bars, so the chart snaps them oddly or they float away from any bar.

**2. Frontend can't repair it (and amplifies the look).**
`getMedianCandleGapSec(sourceCandles)` now sees ~12,000 s gaps → `candlesAreCoarse = true`
(StrategyMap ~292–293), so `displayCandles` takes the coarse branch and renders the sparse 1-minute
bars **as-is** (`normalizeDisplayCandles`, ~296). `resampleCandlesForDisplay` can't help because the
in-between minutes are already gone — there is nothing left to aggregate. (This is *why* frontend
aggregation, Option A, can't work without re-fetching the full file.)

**3. Shared-cache poisoning (latent correctness bug).**
`loadCandlesForRun` early-returns/caches by run id with **no resolution check**:
```js
if (Array.isArray(current.candles) && current.candles.length) return current.candles;  // store.js ~2857
// …later writes the fetched array into runs[runId].candles
```
The Strategy Map now calls it with `{ limit: 12000 }`, but **OB Retest** (`useRetestData.js:107`) and
**Breakeven verification** (`BreakevenTab.jsx:815`) call it **without** a limit because they need true
1-minute OHLC. Whoever loads first wins the cache: open the Strategy Map first and those analytics get
the **sparse display candles**, silently degrading intrabar retest / BE verification. (Pre-existing
risk introduced by the `limit` change, independent of the striding visual bug.)

## Is striding confirmed? **Yes** — server.py ~759–761, `candles[::step][:limit]`. No OHLC aggregation anywhere in the candle path.

## Exact files implicated

| File | Location | Issue |
|---|---|---|
| `Lux-OB-Backtester/sidecar/server.py` | `read_candles_file` ~759–761 | **Row-stride downsample** (the visual bug) |
| `Lux-OB-Backtester/sidecar/server.py` | `get_run_candles` ~1474 | Endpoint surface (param plumbing) |
| `frontend/src/pages/StrategyMap.jsx` | candle effect ~664; `candlesAreCoarse`/`displayCandles` ~292–298 | Requests `limit`; renders sparse bars as coarse |
| `frontend/src/data/store.js` | `loadCandlesForRun` ~2854–2900 | Caches downsampled under shared `candles`, no resolution guard |
| `frontend/src/data/sidecarClient.js` | `getRunCandlesByRunId` ~86–92 | Forwards `limit` (fine; will forward new param) |
| `frontend/src/components/lab/retest/useRetestData.js` | ~107 | Full-resolution caller (no limit) — can be poisoned |
| `frontend/src/components/lab/protection/BreakevenTab.jsx` | ~815 | Full-resolution caller (no limit) — can be poisoned |

## Recommended architecture — **Option B: backend OHLC bucket aggregation**

Aggregate the 1-minute rows into **uniform time buckets** server-side and return ~12 k **continuous
OHLC** candles:
- `open` = first row in bucket, `high` = max, `low` = min, `close` = last, `volume` = sum,
  `time` = bucket start.
- Bucket size derived from the run's span and a target point count, snapped to a sane interval, e.g.
  `bucket = max(60, round_to_nice((last_ts − first_ts) / target_points))` → ~12 k evenly-spaced bars.
- This preserves the true high/low range, yields adjacent same-width bars (no gaps/specks), and keeps
  the payload at ~12 k. Markers then land within real, contiguous buckets.

Option A (frontend aggregation) is rejected — it needs the full 147 MB. Option C (use a 15 m file) is
not available — these runs only have a 1-minute `candles.csv`; no coarser file exists without a
re-run. (Range-based fine loading on zoom, via the endpoint's existing `start`/`end`, is the right
*follow-up* for full-resolution zoom, but is not needed for the fix.)

## Smallest safe implementation plan

**Backend (primary fix) — `sidecar/server.py` `read_candles_file`:**
Replace the stride block with OHLC bucket aggregation when a display cap is requested. Make it
explicit and backward-compatible: add a param such as `max_points` (or `aggregate=ohlc`) used by the
display path; **leave the no-arg / unlimited path returning full data** so retest/BE are unaffected.
Same response shape `{count, candles:[{t,time,o,h,l,c,volume}]}`. (~15–25 lines. A single streaming
pass that accumulates into buckets also avoids materializing 2.4 M dicts — a memory win — but even
aggregating the already-read list is strictly correct and no worse than today.)

**Frontend — request aggregation + stop cache poisoning:**
1. `StrategyMap.jsx`: pass the aggregation intent (e.g. `{ maxPoints: 12000 }` / `{ aggregate: true }`)
   instead of/in addition to `limit`; keep the existing "downsampled for performance" note.
2. `sidecarClient.getRunCandlesByRunId`: forward the new param (one line).
3. `store.loadCandlesForRun`: tag the cached result with its resolution (e.g.
   `candlesResolution: "display" | "full"`) and **(a)** don't early-return a `display` cache for a
   full request, **(b)** don't overwrite a `full` cache with `display`. Simplest equivalent: store
   display candles in a separate slot the Strategy Map reads, leaving `run.candles` for full-resolution
   consumers. This closes the retest/BE poisoning hole.

Backend change is required (the existing `?limit` is genuinely the wrong algorithm); it is confined to
the **display read path** and does not touch the backtest, importer, or any artifact — backtests read
`candles.csv` directly, never this endpoint, so results are unaffected.

## Safety check against requirements
- **No full 147 MB to browser:** aggregation returns ~12 k bars. ✅
- **Small runs unchanged:** count ≤ target → returned in full (no aggregation). ✅
- **Existing endpoint consumers unbroken:** full-resolution callers pass no cap → unchanged; the new
  param is opt-in. ✅ (plus the cache-resolution guard prevents cross-contamination)
- **Backtest results unaffected:** display endpoint only; backtest reads the CSV directly. ✅
- **OHLC visually correct:** bucket aggregation preserves high/low and contiguity. ✅

## Validation plan
1. `22cdd55d` / `86c11cdc` Strategy Map: loads quickly; receives ~12 k candles; bars render as
   **continuous OHLC** (no dots/gaps); zoom shows sensible high/low ranges; downsample note visible.
2. Network: confirm the `/candles` response is ~12 k rows (not 2.4 M) and a few-MB payload.
3. Markers/trades overlay on contiguous bars acceptably (snap within real buckets).
4. **Cache isolation:** open Strategy Map first, then OB Retest and Breakeven tabs → confirm those
   still receive **full 1-minute** candles (not the 12 k display set) — i.e. no poisoning.
5. Small eager run: unchanged (no aggregation path taken).
6. `86c11cdc` selector still lists C20–C50; backend: `py_compile` + a unit check that aggregation
   over a synthetic 1 m series yields correct bucket open/high/low/close/volume; confirm no backtest
   or importer files changed.

*No code was changed. Audit + fix plan only.*
