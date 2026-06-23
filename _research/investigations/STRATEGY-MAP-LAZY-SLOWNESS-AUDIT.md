# Strategy Map Slowness on Large Lazy Runs — Audit

**Mode:** Audit only. No code changed.
**Runs examined:** `22cdd55d…` (552 CSVs) and `86c11cdc…` (185 CSVs, deep delays).

---

## TL;DR

The Strategy Map is **not** doing all-variant scenario work — it resolves and renders a
**single** selected scenario. The slowness is the **candle dataset**: each of these runs ships a
**147 MB `candles.csv` with ~2.4 million 1-minute rows**, and the Strategy Map loads the **entire**
file with **no downsampling**, then normalizes / resamples / sorts the full 2.4 M-point series on
the main thread before the chart can paint. Lazy import makes it worse only because lazy **defers**
candles, so the whole 2.4 M-row cost lands on the Strategy Map the moment you open it.

It is **category C (loading too much data) + A (processing/rendering too many points)** — **not** B
(too many variants), **not** E (full-data aggregation), **not** a multi-variant lazy-load fan-out.

---

## A. Root cause

`pages/StrategyMap.jsx` mounts → one-shot effect calls `loadCandlesForRun(runId)` **with no
`limit`** (line ~645). That hits the sidecar `/runs/{id}/candles` endpoint, which **defaults
`limit=None`** and therefore **reads and returns every row** (`read_candles_file`, server.py
~729–762). For these runs that is **2.4 M rows / 147 MB**. The browser then:

1. stores all **2.4 M candle objects** in `state.runs[runId].candles` (`loadCandlesForRun`, store.js ~2881);
2. `getMedianCandleGapSec(sourceCandles)` — **sorts 2.4 M timestamps** (memo, StrategyMap ~292);
3. `displayCandles` memo — these are **1-minute** candles (median gap 60 s ⇒ *not* coarse), so it runs
   `resampleCandlesForDisplay(sourceCandles, …)` which **builds a Map over all 2.4 M rows** (~295–298,
   ~1514); the 1 m path instead runs `normalizeDisplayCandles` — **a `.map()` over all 2.4 M** (~1482);
4. `CandleChart` receives the full series.

Every one of those is an O(2.4 M) main-thread pass on a 147 MB payload. That is the freeze. The
endpoint *can* downsample (`limit` → stride, server.py ~759), but the Strategy Map never asks for it.
The endpoint comment even concedes: *"Range/downsample streaming should replace this for very large
multi-year map views."*

**Why lazy makes it visible:** a lazy run sets `candlesLazy:true` / `candlesMeta` and does **not**
import candles up front (`reloadLazyRunFromManifest`, store.js ~2633–2634). So unlike a small eager
run (tiny candle set, already in memory), the full 2.4 M-row load+process is incurred **on Strategy
Map open** for exactly these large runs.

## B. Confidence

**High.** Evidence is concrete: on-disk `candles.csv` = **147 MB, 2,401,461 rows** (22cdd55d) /
2,405,846 rows (86c11cdc); the endpoint default `limit=None`; the Strategy Map call site passes no
options; and the three full-series memos (`getMedianCandleGapSec`, `normalizeDisplayCandles`,
`resampleCandlesForDisplay`) each iterate the whole array. The "all-variant metrics" hypothesis is
**disproven** by reading the page (below).

## C. Exact files implicated

| File | Symbol / line | Role |
|---|---|---|
| `frontend/src/pages/StrategyMap.jsx` | `loadCandlesForRun(runId)` effect (~642–648) | **Loads full candles, no `limit`** |
| `frontend/src/pages/StrategyMap.jsx` | `getMedianCandleGapSec` memo (~292), `displayCandles` memo (~295–298) | Sort + resample over 2.4 M |
| `frontend/src/pages/StrategyMap.jsx` | `normalizeDisplayCandles` / `resampleCandlesForDisplay` (~1482, ~1514) | O(n) over 2.4 M |
| `frontend/src/data/store.js` | `loadCandlesForRun` (~2854) | Stores 2.4 M objects in memory; no downsample |
| `frontend/src/data/sidecarClient.js` | `getRunCandlesByRunId` (~86) | Sends `limit` only if caller provides it (none does) |
| `Lux-OB-Backtester/sidecar/server.py` | `get_run_candles` / `read_candles_file` (~1474, ~729) | `limit=None` default → returns all rows |

**Not implicated (verified):** `useResolvedScenario.js` resolves **one** scenario via
`selectTrades(canonicalKey,…)` (single key) — no all-variant build. `ScenarioSelector.jsx` only
maps `availableFamilies/thresholds/fillModes` to **buttons** — no per-cell metrics. There is **no**
threshold×arm×BE metrics matrix on this page.

## D. Is the Strategy Map loading lazy rows / fanning out variants?

**No multi-variant fan-out.** Strategy Map uses `useTradeUniverse` + `useResolvedScenario`, neither
of which calls `ensureVariantTrades` / `ensureBeScenarioTrades` / `getRunFileByRunId`. The only
sidecar fetches it triggers are **one-shot**: `reloadFullRunFromSidecar(runId)` (which for a lazy run
just re-runs the cheap manifest reload — guarded by `fullRunLoadAttemptedRef`) and the heavy
`loadCandlesForRun(runId)` (guarded by `candleLoadAttemptedRef`). It does **not** preload many
scenarios. (Side note: because it never calls the lazy entry loader, the **selected scenario's trade
rows aren't auto-loaded** on this page — a correctness gap, but *not* the slowness.)

## E. Classification

* **C — loading too much data:** ✅ primary (147 MB / 2.4 M candle rows pulled in full).
* **A — processing/rendering too many points:** ✅ primary (sort + normalize + resample over 2.4 M on the main thread).
* **B — computing metrics for too many variants:** ❌ no — single-scenario page, no metrics matrix.
* **D — re-render/selector churn:** ⚠️ minor — the candle/OB background `notify()`s re-run the 2.4 M-row memos, but they're memoized on `sourceCandles` so it's ~once, not a storm.
* **E — full-data assumptions on lazy runs:** ❌ only for candles (which are genuinely needed for the chart); no trade/variant full-data assumption.
* **F — other:** the sidecar reads all 2.4 M rows server-side even though a `limit`/stride path exists.

---

## Smallest safe fix plan (ranked)

**Fix 1 — Request a downsampled candle window from the Strategy Map (smallest, highest impact).**
Pass a cap to the existing plumbing: `loadCandlesForRun(runId, { limit: N })` (e.g. N≈6,000–12,000),
which `getRunCandlesByRunId` already forwards as `?limit=` and `read_candles_file` already honors via
stride. Payload drops from ~147 MB / 2.4 M rows to a few thousand points; the normalize/resample/sort
memos become trivial; the chart paints immediately. Frontend-only, one argument. (Server still *reads*
all rows to stride them — acceptable for now; Fix 3 removes that.)
*Correctness risk: very low (chart already resamples for display). Speed: ~100–400×. Size: ~1 line + a
maxPoints derive. Usefulness: high.*

**Fix 2 — Gate the candle load behind intent on lazy runs.** Don't auto-load candles on mount for a
lazy run; load (downsampled) when the chart is actually shown / on user action, and show a "Load chart
candles" affordance. Pairs well with Fix 1. *Risk: low. Speed: removes the cost from initial open.
Size: small. Usefulness: medium-high.*

**Fix 3 — Server-side windowed/strided read (proper).** Make `read_candles_file` stride **while
parsing** (and support `start`/`end` range, already in the signature) so it never materializes 2.4 M
rows. *Risk: low-medium (backend change). Speed: also fixes server CPU/memory. Size: medium.
Usefulness: high — but backend, so defer unless Fix 1 is insufficient.*

**Fix 4 — Virtualize/stream the chart (largest).** Only needed if full-resolution zoom is required;
otherwise Fix 1 makes it moot. *Risk: medium. Size: large. Usefulness: low for the stated goal.*

**Recommended:** **Fix 1 (+ Fix 2)** now — frontend-only, ~1–2 lines of real change, removes the
freeze while keeping the chart fully usable; consider **Fix 3** later to relieve the sidecar.

### Architecture note (matches goal 7)
For lazy runs the Strategy Map should drive its **scenario selector** entirely from
manifest/index/summary (it already does — cheap) and load **candles downsampled** + the **one
selected scenario's rows on demand** (cell/scenario click), never the full candle file or all
variants. A small "chart shows downsampled candles (N of 2.4 M)" / "deep analytics load on selection"
note sets expectations.

## Validation plan
1. Temporary instrumentation (no commit): `console.time` around the candle load + `displayCandles`
   memo; log `sourceCandles.length` and payload bytes — expect 2.4 M / ~147 MB before, a few k after Fix 1.
2. Open `22cdd55d` Strategy Map: page interactive in <1 s; chart renders; `candleLoadStatus` reaches
   `loaded` quickly; no multi-second main-thread freeze (check Performance long-tasks).
3. Confirm scenario selector still lists all thresholds/arms (incl. deep C20–C50) instantly.
4. Confirm clicking a scenario still resolves it (and, if Fix for the rows gap is added, loads that one
   variant's rows on demand — never all variants).
5. Confirm a small eager run is unchanged (its candle set is already small; `limit` is a no-op).
6. eslint clean; existing `*.validate.mjs` suites still green.

*No code was changed. Audit only.*
