# Strategy Map Intrabar Inspector + Arm-Candle Trust — Audit

**Mode:** Audit only. No code changed.

---

## TL;DR

- **Selected Arm C50 reads the correct file.** The scenario resolves to
  `entry_triggered_edge_*_d50.csv`; the rows carry `delay_candles_configured = 50`,
  `arm_candle_index = trigger+50`. Selection is correct.
- **"Fill C1" is a stale legacy label, not the arm.** The badge is computed from the
  `filled_on_trigger_candle` boolean only: `true → "Fill C0"`, `false → "Fill C1"`. A C50
  fill (delay 50) has `filled_on_trigger_candle = false` → it falls into the "next" bucket →
  **"Fill C1"**. The badge ignores `fill_delay_candles` / `arm_candle_index` /
  `delay_candles_configured`. It's a labeling bug, **not** evidence the C50 data is wrong.
- **C50 data is trustworthy; the C50 *strategy* is permissive.** With protections OFF (see §4),
  a delayed order arms at trigger+50 **even after price has left the OB**, and fills on a revisit.
  That's exactly your "wins tap the OB and leave" suspicion — and the backend already records it
  per-trade (`retraced_out_before_arm`, `armed_after_ob_exit`). The data is right; the policy is
  the open question.
- **The inspector is "unavailable" because it's being fed the aggregated 6h display candles**, not
  the 1m source. StrategyMap passes `sourceCandles` (now `displayCandles`, 6h) with
  `sourceIsFine = false`, so the magnifier has no 1m bars and shows "Re-import with 1m candles."

---

## 1. Selected scenario identity

`StrategyMap` drives the chart from `useResolvedScenario(SCENARIO, bundle)`:
- `resolveHierarchy` → `resolvedFillMode = "d50"` for Arm C50;
- `buildCanonicalKey("triggered_edge", 10, "d50")` → **`entry_triggered_edge_10p0_d50`**;
- `selectTrades(canonicalKey, …)` reads `entryResults.tradesByMode["entry_triggered_edge_10p0_d50"]`;
- `deriveSourceFile` → **`trades_<variant>__entry_triggered_edge_10p0_d50.csv`**.

Verified against the real file: that CSV's rows carry `delay_candles_configured = 50`,
`arm_candle_index = trigger_ci + 50`. **C50 genuinely reads d50 — no stale/wrong mapping.**

## 2. "Fill C1" source

`pages/strategyMap/useResolvedScenario.js` ~318–351 sets `badgeState`:
```
filledOnTriggerCandle (filled_on_trigger_candle === true)  → "same"
filledOnNextCandle    (filled_on_trigger_candle === false) → "next"
```
`pages/StrategyMap.jsx` ~2151 maps `same → "Fill C0"`, `next → "Fill C1"` (and the narrative
~2200). **There is no badge state for C2…C50** — every non-trigger-candle fill collapses to
"next/Fill C1". So "Fill C1" means *"did not fill on the trigger candle,"* **not** arm C1, and
**not** stale data. The real arm/delay lives in `delay_candles_configured`, `arm_candle_index`,
`fill_delay_candles` (already imported by `importer.js` ~641–671 and even shown in the inspector's
detail table at StrategyMap ~2367 as `arm_candle_index`) — the badge just doesn't use them.
(Note: `entryAnalytics.js` ~219–236 already does the right thing, preferring `fill_delay_candles`.)

## 3. Trade-row verification (real C50 example, run 86c11cdc)

From `trades_allow_multi_position__entry_triggered_edge_10p0_d50.csv`:

| field | value |
|---|---|
| `delay_candles_configured` | **50** |
| `arm_candle_index` | 16811 (= trigger_ci + 50) |
| `fill_delay_candles` | **51** (realized) |
| `filled_on_trigger_candle` | **False** → drives "Fill C1" |
| `exited_ob_before_arm` | **True** |
| `retraced_out_before_arm` | **True** |
| `armed_after_ob_exit` | **True** |
| `ob_occupied_at_arm` | True |
| `trigger_time` → `fill_time` | 15:35 → 16:26 (≈51 min later) |
| `outcome` / `net_r` | LOSS / −1.07R |

The row is **internally consistent and correctly represents C50**: trigger, +50-candle arm, price
left the OB during the delay (`retraced_out_before_arm = True`), the order armed *after* the exit
(`armed_after_ob_exit = True`), and filled on a revisit. C50 is **not** mis-stored.

## 4. Backend delayed-entry semantics (the trust question)

`src/execution.py`:
- `d50` = the limit order becomes **fill-eligible 50 candles after the trigger** (`arm_ci =
  trigger_ci + delay`, ~821). Before that it is inactive.
- During the delay window the engine **observes** whether price leaves the OB
  (`_dw_entry_side_exit`, `exited`/`armed_after_ob_exit`, ~823–850). These helpers are explicitly
  **observational** — *"do not affect order logic, fills, cancellations, or any existing field"*
  (~749–750, ~810).
- **Whether a delayed order is cancelled when price exits the OB depends entirely on config**
  (`triggered_edge_cancel_on_retrace`, `_retrace_pips`, `_retrace_ob_pct`, the FFT move-away
  thresholds, `cancel_on_first_failed_tag`).

**For run 86c11cdc, every one of those protections is OFF:**
```
triggered_edge_cancel_on_retrace      = False
triggered_edge_cancel_retrace_pips    = 0
triggered_edge_cancel_retrace_ob_pct  = 0
triggered_edge_cancel_on_first_failed_tag = False
triggered_edge_fft_move_away_pips     = 0   (and _ob_multiple = 0)
```
So **nothing cancels a delayed order when price leaves the OB before arming.** The order patiently
arms at trigger+50 and fills on any later revisit — precisely the backlog concern: *"trigger
threshold reached → delay → price exits OB before arming → later revisit fills."* The sample row
(`armed_after_ob_exit = True`) is a live instance.

**Verdict:** the C50 *numbers* are trustworthy and the engine **correctly flags** the suspicious
pattern per-trade. Whether arming-after-exit *should* be allowed is a **strategy-policy** decision,
not a bug. The protection to forbid it already exists (`cancel_on_retrace`) — it was simply set to 0
in these runs. So your visual distrust is well-founded as a *strategy* concern, and is fully
*measurable* from `retraced_out_before_arm` / `armed_after_ob_exit` — it's just not surfaced in the
UI yet.

## 5. Intrabar inspector — why it's "unavailable"

`components/lab/IntrabarInspector.jsx` slices the candles it's handed:
`slicedCandles = sliceCandlesByTime(sourceCandles, windowStart, windowEnd)` (~369), and shows the
`UnavailableMessage` ("Re-import with 1m candles") when the candles are coarse. In `StrategyMap.jsx`
~1106–1108 it is fed:
```
sourceCandles={sourceCandles}         // now bundle.displayCandles → 6h aggregated
sourceIsFine={!candlesAreCoarse}      // false (median gap 21600s)
medianCandleGapSec={medianCandleGapSec}
```
Because the overview now uses **aggregated 6h display candles**, the inspector receives 6h bars,
finds **no 1m candles in the window**, and declares itself unavailable — even though the run's full
1m `candles.csv` exists on the sidecar. **The inspector has no path to fetch a fine-resolution
window**; it only reads whatever `sourceCandles` the page passes. This is a direct (expected)
side-effect of the display-aggregation work, isolated to the inspector's data source.

## 6. Backend range candle endpoint

`GET /runs/{id}/candles?start=&end=` (`read_candles_file`, server.py ~729): **supports start/end**
and returns **full-resolution** rows in that window (no aggregation unless `aggregate=ohlc` is
passed). It filters by `start_ts`/`end_ts` while parsing, so a 4-hour window returns only the ~240
1m rows in range. **Caveat:** it still *reads the whole 2.4M-row file* each call (no seek/index), so
each inspector fetch costs a full file scan (~seconds server-side). Functionally correct and fine
for occasional inspector use; a future seek/index or per-run 1m cache would remove the scan.

## 7. Correct inspector design (recommended)

- Overview chart stays **aggregated 6h** (performance) — unchanged.
- On trade click, the inspector fetches a **small full-resolution 1m window** from the sidecar:
  `GET /runs/{id}/candles?start=<event−N>&end=<event+N>` (no `aggregate`), where the window spans
  `trigger_time … fill_time … exit` ± padding (e.g. ±~`max(60, delay+padding)` minutes, or ±N M15
  bars). Cache it under a dedicated key (e.g. `run.inspectorCandles[windowKey]`), **never**
  `displayCandles` and **never** the full `candles.csv`.
- Overlay: OB top/bottom, trigger threshold, trigger candle, **arm candle (C50)**, fill candle,
  entry, stop/TP, outcome — and the validity flags (`retraced_out_before_arm`, `armed_after_ob_exit`)
  so "tapped and left then revisited" is visible at a glance.
- Drives off the selected trade's own timestamps; independent of the overview's aggregation.

## 8. Fix ranking (smallest-safe first)

| # | Fix | Scope | Risk | Value |
|---|---|---|---|---|
| **A** | **Diagnostics label** — badge/narrative use `delay_candles_configured`/`fill_delay_candles`/`arm_candle_index` → "Arm C50 · filled +51" instead of "Fill C1". Add a `retraced_out_before_arm` flag chip. | FE only (`useResolvedScenario.js` badge logic, `StrategyMap.jsx` badge map + narrative) | Low | High — removes the core confusion |
| **B** | Selected-scenario row resolution | **No fix needed** — already correct (C50 → d50) | — | — |
| **C** | **Inspector range-fetch** — fetch a 1m window via `/candles?start=&end=` on click; feed the inspector full-res candles + `sourceIsFine=true`; cache in a dedicated slot. | FE (`StrategyMap.jsx`, `store.js`, `sidecarClient.js` already forwards start/end) | Low–Med | High — restores the inspector |
| **D** | **Delayed-entry protection** — *optional strategy change*, not a bug. Either (i) surface `retraced_out_before_arm`/`armed_after_ob_exit` as analytics filters/columns so you can quantify the "armed-after-exit" wins, and/or (ii) enable the existing `triggered_edge_cancel_on_retrace` in future runs to forbid arming after OB exit. | Backend config / analytics | Med | High for strategy validity (decide after A+C let you see it) |
| **E** | Per-trade "Arm verification" mini-timeline (trigger → delay window → arm → fill, with exit flag). | FE UX | Med | Nice-to-have |

**Recommended order:** **A → C → (surface flags) → D decision → E.** A and C are small, frontend,
and immediately make C50 trustworthy *and* inspectable; D is a strategy decision you can make once
A+C let you actually see the armed-after-exit trades.

## Validation plan (for when implemented)
1. **A:** a C50 trade shows "Arm C50" (from `delay_candles_configured`) and "filled +51"
   (`fill_delay_candles`), not "Fill C1"; a true C0 still shows C0; a C1 shows C1. A
   `retraced_out_before_arm = True` trade shows a clear "armed after OB exit" flag.
2. **C:** clicking a trade fetches ~`±window` 1m candles (`/candles?start=&end=`, no aggregate),
   inspector renders continuous 1m bars with OB/trigger/arm/fill overlays; payload is a few hundred
   rows, **not** 2.4M; `displayCandles` and full `candles.csv` are untouched; OB Retest/Breakeven
   still use their own full-resolution candles.
3. **Trust:** for the sample C50 LOSS row, the inspector visibly shows price tapping the OB,
   leaving (`retraced_out_before_arm`), then arming/​filling on revisit — confirming the data.
4. Small eager run unchanged; overview still 6h-aggregated; selector still C20–C50.

*No code was changed. Audit only.*
