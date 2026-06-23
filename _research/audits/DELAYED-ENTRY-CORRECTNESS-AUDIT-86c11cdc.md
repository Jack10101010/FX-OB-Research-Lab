# Delayed-Entry Correctness Audit — Run 86c11cdc

**Mode:** Audit only. No code changed.
**Run:** 86c11cdc (EURUSD, triggered-edge delays C20–C50, all cancel protections OFF, all trades bullish).
**Test:** a fill is *invalid (phantom)* when the recorded entry/fill price lies **outside the engine's own
recorded fill-candle range** (`entry < fill_candle_low` or `entry > fill_candle_high`, 0.1-pip tolerance).
This uses only the engine's exported columns — no external reconstruction.

---

## Bottom line

**The delayed-entry engine is fundamentally broken for delayed (Cn>0) entries.** ~**70% of all fills
are phantom** — recorded at a stale OB-edge price the market never traded on the fill candle. The
strategy's *entire apparent edge is an artifact*: removing phantom fills turns **+1,756 R (PF 1.96)
into −547 R (PF 0.41)**. The "deep delays look best" pattern is the bug, not a signal — the deeper the
arm, the larger the stale-price gap and the more phantom wins.

---

## 1. Scope (per arm; aggregated across the 1/3/5/10% thresholds)

| arm | filled | invalid fills | (below low) | same-candle fill+exit | wins w/ fill==exit time | armed_after_ob_exit | retraced_before_arm |
|---|---|---|---|---|---|---|---|
| C20 | 579 | **365 (63%)** | 365 | 39 | 39 | 508 | 508 |
| C25 | 555 | **363 (65%)** | 363 | 59 | 59 | 506 | 506 |
| C30 | 536 | **353 (66%)** | 353 | 70 | 70 | 498 | 498 |
| C35 | 504 | **371 (74%)** | 371 | 75 | 75 | 467 | 467 |
| C40 | 480 | **350 (73%)** | 350 | 81 | 81 | 451 | 451 |
| C45 | 467 | **341 (73%)** | 341 | 77 | 77 | 446 | 446 |
| C50 | 450 | **355 (79%)** | 355 | 82 | 82 | 429 | 429 |
| **ALL** | **3,571** | **2,498 (70%)** | 2,498 | 483 | 483 | 3,305 | 3,305 |

- **All invalid fills are *below* the candle low** (0 above) — every trade is bullish (3,792 bullish, 0
  bearish), and the bug fills bullish orders at the stale low edge after price has run up.
- **All 483 same-candle fill+exit rows are wins with `fill_time == exit_time`** — the "fill and TP in the
  same 1-minute bar" signature.
- **~93% (3,305/3,571) have `armed_after_ob_exit` = `retraced_out_before_arm` = true** — price had left the
  OB before the order armed, yet a fill was still recorded.

## 2. Impact (phantom fills removed)

| arm | ALL: N / netR / WR% / PF | VALID-only: N / netR / WR% / PF | netR removed |
|---|---|---|---|
| C20 | 579 / **+188** / 46.5 / 1.57 | 214 / **−102** / 19.6 / 0.44 | 290 |
| C25 | 555 / **+214** / 48.5 / 1.70 | 192 / **−123** / 14.1 / 0.30 | 337 |
| C30 | 536 / **+223** / 49.4 / 1.77 | 183 / **−83** / 20.2 / 0.46 | 306 |
| C35 | 504 / **+245** / 51.8 / 1.95 | 133 / **−72** / 17.3 / 0.38 | 317 |
| C40 | 480 / **+271** / 54.4 / 2.16 | 130 / **−70** / 17.7 / 0.39 | 340 |
| C45 | 467 / **+309** / 57.6 / 2.47 | 126 / **−59** / 19.8 / 0.45 | 368 |
| C50 | 450 / **+306** / 58.2 / 2.53 | 95 / **−38** / 22.1 / 0.52 | 344 |
| **ALL** | **3,571 / +1,756 / — / 1.96** | **1,073 / −547 / — / 0.41** | **2,303** |

- **Phantom (invalid) trades:** 2,498, net **+2,303 R** — i.e. **131%** of the run's total net R. The
  valid subset is *net-negative*.
- **Invalid WINS: 1,658** (vs only **198** valid wins). Phantom wins outnumber genuine ones ~8:1.
- **WR and PF collapse** on every arm (e.g. C50 WR 58%→22%, PF 2.53→0.52). The apparent monotonic
  "deeper arm = better" ranking is purely the growing phantom contribution.

## 3. Engine fault (located)

`src/execution.py`, the triggered-edge fill condition — **lines 2144 (primary), and the duplicated
2102 / 2120 reverse-touch branches.** The touch test for an *armed triggered-edge* order is **inverted**:

```python
(candle["high"] >= _pm_entry if _pm_dir == "bullish" else candle["low"] <= _pm_entry)   # TE + armed
   if (_pm_em == "triggered_edge" and item["triggered_edge_armed"])
   else (candle["low"]  <= _pm_entry if _pm_dir == "bullish" else candle["high"] >= _pm_entry)  # normal limit
```

- A correct **buy limit** at the OB edge fills when **`low <= entry`** (price dips to the edge) — that's
  the `else` (normal) branch.
- The **armed triggered-edge** branch instead fills bullish on **`high >= entry`** — which is **trivially
  true whenever price is at/above the edge.** After the delay window, price has typically run *up* away
  from the edge, so the **first post-delay candle satisfies `high >= entry`** and the order "fills" — at
  the **stale `plan["entry"]` (OB edge) price** (`_apply_fill_metrics`, fill price = `plan["entry"]`;
  `fill_candle_index = candle_index`, execution.py:1037).

Tracing trigger → fill:
- **Eligibility gate** (line 2144): `candle_index >= trigger_ci + trigger_delay_candles` — correctly
  defers fills until after the delay. ✓
- **Post-arm touch required?** **No.** The condition does **not** require a genuine entry touch
  (`low <= entry`) on or after the arm candle; `high >= entry` is a "price is above the edge" test.
- **Stale touches reused?** Worse — no touch is needed at all. The order fills at the stale edge on the
  first eligible candle regardless of how far price has moved (`max_distance_away_before_fill_pips` is
  routinely 40–70+).
- **TP/SL credited without a valid fill?** **Yes.** Once "filled" at the stale entry, TP/SL are evaluated
  from that stale price on the same candle. Because price had already passed TP **during** the delay
  window, TP is credited immediately → same-candle phantom win (`fill_candle_index == exit_candle_index`,
  `bars_to_exit = 0`).
- **Secondary:** `armed_at` exports the *trigger* time, not the arm-candle time (cosmetic vs the fill bug).

The delay-window helpers (`_delay_window_update`, lines 800–921) are explicitly *observational* and do
**not** correct or gate the fill — they only record the `exited_ob_before_arm` / `armed_after_ob_exit`
flags that, ironically, prove the fills are invalid.

## 4. Examples (side by side)

**5 clearly INVALID wins** (fill price far outside the fill candle):

| arm | OB | dir | entry | fill cLow | fill cHigh | TP | netR | gap | delay |
|---|---|---|---|---|---|---|---|---|---|
| C45 | 440 | bull | 1.03660 | 1.04370 | 1.04479 | 1.04008 | +1.97 | **71.0 pips below low** | 45 |
| C45 | 440 (3%) | bull | 1.03660 | 1.04370 | 1.04479 | 1.04008 | +1.97 | 71.0 | 45 |
| C45 | 440 (5%) | bull | 1.03660 | 1.04370 | 1.04479 | 1.04008 | +1.97 | 71.0 | 45 |
| C45 | 440 (10%) | bull | 1.03660 | 1.04370 | 1.04479 | 1.04008 | +1.97 | 71.0 | 45 |
| C40 | 440 | bull | 1.03660 | 1.04322 | 1.04439 | 1.04008 | +1.97 | 66.2 | 40 |

→ entry **and** TP both sit ~36–71 pips *below* the fill candle's low; price was at 1.0437–1.0448 yet the
trade "fills" at 1.0366 and books TP at 1.04008. (OB-1146 from the prior trace is the same pattern: entry
18.6 pips below the fill candle.)

**5 clearly VALID delayed-revisit wins** (fill price inside the fill candle):

| arm | OB | dir | entry | fill cLow | fill cHigh | TP | netR | gap | delay |
|---|---|---|---|---|---|---|---|---|---|
| C50 | 123 | bull | 1.17370 | 1.17350 | 1.17370 | 1.17708 | +1.96 | 0.0 | 95 |
| C50 | 138 | bull | 1.17972 | 1.17954 | 1.17978 | 1.18258 | +1.96 | 0.0 | 52 |
| C50 | 602 | bull | 1.09421 | 1.09418 | 1.09431 | 1.09615 | +1.94 | 0.0 | 50 |
| C50 | 833 | bull | 1.08799 | 1.08793 | 1.08799 | 1.08987 | +1.94 | 0.0 | 57 |
| C50 | 973 | bull | 1.12791 | 1.12782 | 1.12800 | 1.13115 | +1.96 | 0.0 | 67 |

→ entry lies **within** the fill candle's range (price genuinely returned to the edge after arming, 50–95
candles later) and TP is *above* the fill candle — these are physically plausible fills.

## 5. Conclusions

- **Is the delayed-entry engine fundamentally broken?** **Yes**, for delayed (Cn>0) entries. The armed
  fill test is the inverted comparison (`high >= entry` for bullish), so delayed orders fill at a stale
  edge price the market never traded, and book TP that was passed during the delay. (Arm C0 is least
  affected because at delay 0 the edge ≈ the trigger candle's price.)
- **Isolated to a subset?** No — **~70% of all delayed fills** are phantom across every arm; the
  physically valid subset (198 wins) is a minority and is *net-negative*. This is systemic.
- **Which arms most affected?** Invalid *rate* is high everywhere (63%→79%, rising with depth). More
  importantly the **apparent edge inflation grows with delay**: C50's PF 2.53 is almost entirely phantom
  (valid-only 0.52). The deep-delay "outperformance" is the artifact.
- **How much edge disappears?** **All of it, and then some.** Net R **+1,756 → −547**; PF **1.96 → 0.41**;
  phantom fills supply **131%** of the reported net R and **1,658 of 1,856 wins**. With valid fills only,
  triggered-edge delayed entries are a **losing** strategy on this run.

**Do not trust any C20–C50 (or BE-on-delayed) results from this run, or any run using this build of the
delayed triggered-edge fill path, until the fill condition is corrected.** (Fix is out of scope for this
audit; the defect is the inverted touch test at `src/execution.py:2144`/2102/2120 plus the absence of a
required post-arm entry touch.)

*No code was changed. Audit only.*
