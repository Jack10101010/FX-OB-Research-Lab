# Strategy Map Aggregated Candle Times Are Invalid — Audit + Fix Plan

**Mode:** Audit + fix plan only. No code changed.

---

## Root cause (confirmed)

`aggregate_candles_ohlc` (server.py ~729–780) derives the bucket width from the data span:
```python
bucket_seconds = max(60, -(-span // max_points))   # ceil(span / max_points)
...
"time": first_ts + idx * bucket_seconds            # bucket start = first candle + n·bucket
```
For 22cdd55d, `span ≈ 203.66M s` and `max_points = 12000` → **bucket_seconds ≈ 16,973 s ≈ 282.9 min**,
an arbitrary width, and the bucket starts are offset from the **first candle's wall-clock time**, not
from a calendar boundary. So consecutive bars land at `first_ts + n·282.9min` → 05:32 → 10:15 → 14:59 →
19:42 → 00:25 …, i.e. the irregular times observed. The OHLC values are correctly bucketed; only the
**bucket width and alignment** are wrong. (The frontend then mislabels them — see §4.)

**Confirmed:** yes, it uses `ceil(span / max_points)`; yes, bucket start is first-candle-relative; yes,
`bucket_seconds` can be arbitrary (≈283 min here).

## Chosen interval policy

Pick from a fixed ladder of clean intervals (no existing ladder in either repo — introduce one in the
sidecar):

```
1m=60  5m=300  15m=900  30m=1800  1h=3600  2h=7200  4h=14400  6h=21600  12h=43200  1D=86400
```

**Selection (deterministic):** the **smallest** ladder interval `I` such that `ceil(span / I) ≤ max_points`;
if none qualifies (extreme span), use the largest (`1D`). This guarantees `returned_count ≤ max_points`
(empty buckets, e.g. weekends, are simply omitted, so the real count is lower).

**Evidence (computed against the real files, max_points=12000):**

| Run | Span | Chosen | Max buckets | Aligned starts |
|---|---|---|---|---|
| 22cdd55d | 2357 d | **6h** (21600 s) | ≈9,430 | 2020-01-02 00:00, 06:00, 12:00, 18:00 … |
| 86c11cdc | 2360 d | **6h** (21600 s) | ≈9,442 | 2020-01-02 00:00, 06:00, 12:00, 18:00 … |

Both resolve to **6h**, ≤12k buckets, on clean UTC boundaries — no more :32/:59/:25.

## Timestamp alignment

Floor each candle to an interval boundary using the **epoch** (epoch 0 = 1970-01-01 00:00 UTC, so this is
inherently UTC-aligned):
```
bucket_key   = ts // I
bucket_start = bucket_key * I
```
- 15m → multiples of 900 s ⇒ `minute % 15 == 0`.
- 4h/6h → multiples of 14400/21600 s ⇒ `hour % 4 == 0` (resp. `% 6`) and `minute == 0`.
- 1D → 00:00 UTC.

`time` = `bucket_start` (aligned, continuous); `t` = first underlying candle's raw timestamp (truthful
tooltip). Open/close still chosen by candle time; high=max, low=min, volume=sum. Order-independent.

## Frontend implications (§4)

Today the frontend mislabels aggregated data:
- `medianCandleGapSec` on 6h bars = 21600 s ≥ 900 ⇒ `candlesAreCoarse = true` ⇒ `displayTfOptions = ["15m"]`
  and `displayTf` is forced to **"15m"** (StrategyMap ~317–318, ~711) — but the bars are **6h**. Misleading.
- The downsample pill currently says a generic "aggregated for performance" without the real interval.

Fix (small, frontend): surface the **actual** interval from backend metadata.
- Pill: *"Aggregated to 6h candles for performance"* using `bucket_label`.
- The TF control: when `displayCandlesMeta.aggregated`, show the real `bucket_label` (e.g. "6h") instead of
  "15m", and keep the lower-TF (1m/5m) views disabled (already the case via `candlesAreCoarse`). No further
  client-side resampling of already-aggregated bars (already true — coarse path uses `normalizeDisplayCandles`).

## Files needing edits

**Backend — `Lux-OB-Backtester/sidecar/server.py`:**
- Add an interval ladder + `label↔seconds` map (module constant + tiny helpers `choose_display_interval(span, max_points)` and `interval_label(seconds)`).
- `aggregate_candles_ohlc`: replace `ceil(span/max_points)` with the ladder choice; bucket by epoch-floor (`ts // I * I`); return `(buckets, bucket_seconds, bucket_label)`.
- `read_candles_file`: thread `bucket_label` into the response (alongside existing `aggregated`, `bucket_seconds`, `source_count`, `returned_count`).
- `get_run_candles`: unchanged (spreads `**data`).

**Frontend — `FX-OB-Research-Lab`:**
- `frontend/src/data/store.js`: capture `bucket_label` into `displayCandlesMeta.bucketLabel` (one field).
- `frontend/src/pages/StrategyMap.jsx`: pill wording uses `bucketLabel`; TF selector reflects the real
  interval when aggregated (avoid the "15m" implication).
- `frontend/src/data/sidecarClient.js`: **no change** (already forwards params; response passes through).

Performance fix and cache isolation (`displayCandles` slot) remain intact — only the bucket width,
alignment, and labels change.

## Validation plan
1. **Synthetic 15m:** 1m candles over a few hours → every bucket `time` has `minute % 15 == 0`; OHLC exact
   (open=first, high=max, low=min, close=last, volume=sum).
2. **Synthetic 4h:** every bucket `hour % 4 == 0 and minute == 0`; OHLC exact.
3. **Boundary/empty:** a gap (missing minutes) yields no phantom bucket; counts ≤ max_points.
4. **Real 22cdd55d / 86c11cdc:** `bucket_label == "6h"`; all `time`s on 00:00/06:00/12:00/18:00 UTC; no
   :32/:59/:25; `returned_count ≤ 12000`; OHLC invariants (`h ≥ max(o,c)`, `l ≤ min(o,c)`, `h ≥ l`) hold.
5. **StrategyMap:** continuous candles; pill reads "Aggregated to 6h candles…"; TF control shows 6h (not
   15m); no dots; OB Retest / Breakeven still load full-resolution candles (cache isolation intact).
6. `py_compile sidecar/server.py`; eslint changed FE files; existing `*.validate.mjs` suites still pass.

*No code was changed. Audit + fix plan only.*
