# Trade OB-1146 / L_1146 — Arm C50, Filled +50 — End-to-End Trace

**Mode:** Audit only. No code changed.
**Run:** 86c11cdc (EURUSD, delays [20–50], all cancel protections OFF).
**Trade:** `ob_id=1146`, `trade_id=L_1146`, bullish, `entry_triggered_edge_*_d50` (identical row across the 1/3/5/10% thresholds).

## Verdict (up front)

**The delayed-entry ENGINE is wrong — the Strategy Map visualization is faithful.** The engine
records a **fill that could not have happened**: the order is stamped filled at the original OB-edge
price **1.15302** on the **+50 arm candle (17:31)**, but that candle traded **1.15488–1.15504** —
the recorded entry is **18.6 pips below the fill candle's own low**, and the TP (1.15388) had already
been blown through 48 minutes earlier. The visualization just renders this bad row, which is why the
1m inspector would show the fill marker floating ~19 pips below the 17:31 candle.

## Requested values (from the CSV row, cross-checked against candles.csv)

| Field | Value | Candle time (idx → candles.csv) |
|---|---|---|
| trigger timestamp | 2026-06-09 **16:41:00** UTC | idx 2394783 → 16:41 ✓ |
| arm timestamp | **two conflicting values** (see divergence #1) | `armed_at`=16:41 ; `arm_candle_index`→17:31 |
| fill timestamp | 2026-06-09 **17:31:00** UTC | idx 2394833 → 17:31 ✓ |
| exit timestamp | 2026-06-09 **17:31:00** UTC (same candle, `bars_to_exit=0`) | idx 2394833 → 17:31 ✓ |
| trigger candle index | **2394783** | = 16:41 ✓ |
| arm candle index | **2394833** | = trigger+50 = 17:31 ✓ |
| fill candle index | **2394833** | = 17:31 ✓ |
| exit candle index | **2394833** | = 17:31 ✓ |
| entry / fill price | **1.15302** | ⚠ candle 2394833 low is **1.15488** |
| TP price | **1.15388** | ⚠ already exceeded; candle 2394833 low 1.15488 > TP |
| SL price | **1.15259** | |
| outcome / net_r | **WIN / +1.86R** | ⚠ fictitious (see below) |

Engine's own `fill_candle_*` columns: O=1.155, H=1.15504, **L=1.15488**, C=1.15504 — i.e. the engine
**recorded the correct fill candle** (17:31) but an **entry price 18.6 pips below that candle's low**,
with `fill_penetration_pct = 0.0` (claims an exact edge tag that never occurred).

Supporting flags in the row: `delay_candles_configured=50`, `fill_delay_candles=50`,
`filled_on_trigger_candle=False`, `exited_ob_before_arm=True`, `retraced_out_before_arm=True`,
`armed_after_ob_exit=True`, `ob_occupied_at_arm=False`, `ob_exit_time=16:43` (idx 2394785),
`edge_revisit_time=17:31`, `max_distance_away_before_fill_pips=47.8`.

## What actually happened (candles.csv truth)

1. **16:41** trigger — price enters the OB, crosses the trigger threshold.
2. **16:42** price dips to **1.15285** — *touches the entry level 1.15302* — but the order is **not
   fill-eligible** (delay until trigger+50 = 17:31).
3. **16:43** price exits the OB (high 1.15375); over the delay window it runs up to **1.155**, with
   **max high 1.15531** — i.e. **price blows through the TP (1.15388) during the delay**.
4. **17:31** the limit becomes eligible (+50). Price is at **1.1549–1.1550**, ~20 pips above the
   entry. The engine nonetheless **stamps a fill at 1.15302** and **immediately books the TP** as a
   **WIN +1.86R**.

So the only real touch of the entry level happened at **16:42, during the delay, when the order was
ineligible**; by the time the order armed (17:31) price was 20 pips away. The recorded fill is
impossible and the win is spurious.

## Where the data diverges (first → last)

**1. CSV row (backtest engine output) — FIRST and ROOT divergence.**
   - **Fill price vs fill candle:** entry/fill `1.15302` vs fill candle (2394833) range `1.15488–1.15504`. A buy filling 18.6 pips below the candle's low is physically impossible. `fill_penetration_pct=0.0` is false. **This is the engine bug.**
   - **Fictitious win:** TP `1.15388` was already exceeded during the delay (max high 1.15531); crediting it as a fill+win at 17:31 is not a real outcome.
   - **Secondary field inconsistency:** `armed_at=16:41` (trigger candle) contradicts `arm_candle_index=2394833` (=17:31). The engine uses "armed" to mean *limit placed at trigger*, while `arm_candle_index` is *fill-eligibility at trigger+50* — two events, one name.

**2. selectedTriggeredEdge overlay (`useResolvedScenario`) — faithful pass-through (propagates the error).**
   `triggerTime=16:41`, `armedAt/armedAtTime=16:41` (from the wrong `armed_at`), `fillTime=17:31`,
   `armCandleIndex=2394833`, `delayCandlesConfigured=50`, `fillDelayCandles=50`, `entryPrice=1.15302`,
   `retracedOutBeforeArm/armedAfterObExit=True`. No new error introduced — but it carries both the
   wrong `armedAt` (16:41) and the right `armCandleIndex` (+50).

**3. Lifecycle Detail panel — labels/narrative correct; numbers inherit the bad row.**
   Badge "Arm C50 · Filled +50" ✓; narrative correctly says *"price left the OB before the order
   armed — filled on a revisit"* ✓; chips "Armed after OB exit" / "Left OB before arm" ✓. But it
   still displays entry 1.15302 / TP 1.15388 / **WIN** — propagating the fictitious result.

**4. IntrabarInspector markers — where the divergence becomes VISIBLE.**
   The inspector plots the entry/fill marker at price **1.15302** on/near the 17:31 candle, whose 1m
   bars sit at **1.1549–1.1550** → the fill marker floats **~19 pips below the candles**. The "arm"
   marker uses `armedAt=16:41` (trigger), so arm overlaps trigger and the fill detaches 50 candles
   later and ~19 pips below the price track. The inspector is faithful; it simply exposes the
   impossible fill.

**5. Strategy Map markers — same overlay, same detached fill marker** (less obvious at 6h/aggregated
   zoom; visible in the M15 window / 1m inspector).

## Answer

- **First place the data diverges from reality:** the **CSV row emitted by the delayed-entry engine** —
  the fill record (`1.15302` @ candle 2394833 / 17:31) versus the actual candle at that index
  (`1.15488–1.15504`). The fill price is below the fill candle's low and the TP was already passed.
- **Engine vs visualization:** **engine is wrong.** The deep-delay (C50) path stamps a fill at the
  *original OB-edge entry price* on the *arm candle (trigger+delay)* without checking that price
  actually traded at the entry level at/after the arm candle. With `cancel_on_retrace=False` and the
  OB vacated at 16:43 (`armed_after_ob_exit=True`), the result is a phantom fill and a spurious win.
  Every frontend layer (overlay → lifecycle → inspector → map) faithfully renders this; the 1m
  inspector makes the impossibility visible (fill marker ~19 pips off the bars).
- **Secondary (separate) issue:** `armed_at` exports the *trigger* time, not the *arm-candle* time, so
  any "Arm" marker driven by `armed_at`/`armedAt` is drawn 50 candles too early. This is a labeling/marker
  mismatch on top of the primary fill bug.

## Suggested follow-up (not done here)
Backend `src/execution.py` delayed-entry fill logic: when the limit becomes eligible at
`arm_candle_index`, validate that price actually trades through the entry level **on or after** that
candle before recording a fill (and fill at the real touch price/candle, not the stale edge); if the
TP/SL was passed during the delay window, the setup should be a *miss/cancel*, not a fill. Separately,
export `armed_at` as the true arm-candle time (or add an explicit `arm_time` column) so arm markers
align with `arm_candle_index`.

*No code was changed. Audit only.*
