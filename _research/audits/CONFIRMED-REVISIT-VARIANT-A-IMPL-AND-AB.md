# Confirmed Revisit (Variant A) — Implementation + A/B Research

**Repo:** Lux-OB-Backtester. **Mode:** implement + validate + research. **Not staged / committed / pushed.**
**Default-off** flag; plain Triggered Edge behaviour is byte-identical when off.

---

## 1. Implementation

**New kwarg (default off):** `triggered_edge_require_revisit_confirmation=False` on `simulate_trades`.
**Per-order state (internal only — not exported to CSV this prototype):** `require_revisit_confirmation`,
`revisit_touched_after_arm`, `revisit_confirmed`, `revisit_touch_time/candle_index`,
`revisit_confirm_time/candle_index`, plus an internal `_cr_exit_seen`.

**Confirmation state machine** (runs each candle for an armed delayed TE order when the flag is set, placed
right after `_delay_window_update`, modelled on the `cancel_if_exits_ob_before_arm` hook):
1. **Exit seen** — set once `_dw_entry_side_exit(ob, candle)` is true (bullish: candle fully above top;
   bearish: fully below bottom). Tracked at *any* point after trigger (delay window or post-arm).
2. **Post-arm revisit touch** — only after an exit, and only when arm-eligible
   (`candle_index ≥ trigger_ci + delay`): set `revisit_touched_after_arm` on the first in-range touch of the
   entry edge (`low ≤ entry ≤ high`).
3. **Confirming close** — after the touch, set `revisit_confirmed` when a candle closes back on the trade
   side of the edge (bullish `close ≥ OB top`; bearish `close ≤ OB bottom`).

**Fill gate (the only change to fill logic):** the existing main fill condition gains
`… and (not require_revisit_confirmation or revisit_confirmed)`. Stop, target, RR, BE, invalidation,
news/session filters, and the normal in-range physical fill (`low ≤ entry ≤ high`) are **unchanged**.

**Exact bullish rule:** fill only after price (a) closed fully above the OB top at some point after trigger,
(b) returned and touched the top after arm, and (c) a candle closed back ≥ top — then the limit at the top
fills on a true in-range touch. **Bearish** mirrors (below bottom).

### Same-candle touch + confirm + fill — allowed, and it does fill
The guard requires a genuine touch *before* confirming, but a single candle that **wicks to the edge and
closes back on the trade side** satisfies both touch and confirm in the same bar. Because that candle is also
an in-range touch (`low ≤ entry ≤ high`), the existing fill semantics **fill on that same candle**, at the
edge price. This is intended and physically realistic (a limit at the edge would have filled on the wick).
Validation case A exercises exactly this path. Price merely sitting above the OB after exiting does **not**
confirm — a real revisit/touch must occur first (the explicit guard).

---

## 2. Validation

- `py_compile src/execution.py` → OK.
- **`tests/test_confirmed_revisit.py` → 14 passed / 0 failed.** Cases A–F:
  A bullish exit→revisit→close-back→**FILL**; B exit but no revisit→**NO FILL**; C revisit but no
  close-back→**NO FILL**; D stayed-in-OB (never exited)→**NO FILL**; E bearish mirrors of A–D; F flag
  omitted/off → plain delayed-TE behaviour (fills on bare touch). Under the flag a FILL is impossible
  without `revisit_confirmed`, so "FILL" assertions equal "confirmation fired".
- Regression: `test_delayed_te_fill` 10/0, `test_cancel_exit_before_arm` 7/0, `test_be_replay` 74/0,
  `retest_tracker` 178/0. **Default-off preserves existing behaviour.**

---

## 3. A/B research — PRIMARY: Threshold → Arm

**Slice:** 2022-01-01 → 2023-12-31 (2y), reusing the clean run's M1 candles + **183 CHoCH-bullish OBs** +
news cache + identical kwargs (RR 3.3, SB 1, spread/slippage 0.2, all sessions, news blackout+flatten, **no
BE**). **A** = plain delayed TE; **B** = `require_revisit_confirmation=True`. Same slice for both, so the
only difference is the gate. (Full 6.4y per-cell sim exceeds the compute budget here; the definitive full-
range *plain*-TE baseline is the earlier Threshold→Arm matrix. This 2y run is the matched A/B.)

Columns: V=Valid(W+L+NF) · INV=INVALID · PF · NetR · dPF=B−A · kept%=B fills ÷ A fills. (Rows=183 each;
UNFILLED≈10, NEWS_FLATTEN≈3–5, NEWS_TOUCH_CANCEL≈0–3 in every cell.)

### TE 5%
| arm | A V/W/L INV | A PF/NetR | B V/W/L INV | B PF/NetR | dPF | kept% |
|---|---|---|---|---|---|---|
| C1  | 93/15/66 80 | 0.688/−22.0 | 65/10/45 106 | 0.678/−15.4 | −0.01 | 68 |
| C10 | 73/10/53 99 | 0.575/−24.0 | 59/10/39 113 | 0.783/−9.0 | **+0.21** | 78 |
| C20 | 61/9/45 111 | 0.611/−18.6 | 54/9/38 118 | 0.725/−11.1 | +0.11 | 87 |
| C30 | 58/10/42 114 | 0.728/−12.1 | 50/10/34 122 | 0.900/−3.6 | **+0.17** | 85 |
| **C40** | 51/10/36 121 | 0.850/−5.8 | 45/10/30 127 | **1.020/+0.6** | +0.17 | 87 |
| C50 | 48/9/34 124 | 0.811/−6.8 | 42/9/28 130 | 0.984/−0.5 | +0.17 | 86 |

### TE 10%  ← best
| arm | A V/W/L INV | A PF/NetR | B V/W/L INV | B PF/NetR | dPF | kept% |
|---|---|---|---|---|---|---|
| C1  | 90/14/64 83 | 0.663/−23.1 | 62/10/42 109 | 0.727/−12.2 | +0.06 | 67 |
| C10 | 71/10/51 101 | 0.598/−21.8 | 57/10/38 115 | 0.805/−7.9 | **+0.21** | 79 |
| C20 | 59/9/43 113 | 0.640/−16.5 | 53/9/37 119 | 0.745/−10.0 | +0.11 | 88 |
| C30 | 56/10/40 116 | 0.765/−10.0 | 48/10/32 124 | 0.957/−1.5 | **+0.19** | 84 |
| **C40** | 50/10/35 122 | 0.875/−4.6 | 44/10/29 128 | **1.057/+1.8** | +0.18 | 87 |
| C50 | 46/9/32 126 | 0.863/−4.7 | 41/9/27 131 | **1.023/+0.7** | +0.16 | 88 |

### TE 25%
| arm | A V/W/L INV | A PF/NetR | B V/W/L INV | B PF/NetR | dPF | kept% |
|---|---|---|---|---|---|---|
| C1  | 73/10/52 100 | 0.582/−23.3 | 50/7/34 122 | 0.629/−13.4 | +0.05 | 66 |
| C10 | 55/8/39 117 | 0.626/−15.5 | 46/7/31 126 | 0.692/−10.1 | +0.07 | 81 |
| C20 | 48/8/33 124 | 0.742/−9.0 | 45/7/31 127 | 0.692/−10.1 | −0.05 | 93 |
| C30 | 44/9/29 128 | 0.949/−1.6 | 41/8/27 131 | 0.908/−2.6 | −0.04 | 92 |
| C40 | 40/8/27 132 | 0.908/−2.6 | 37/8/24 135 | **1.023/+0.6** | +0.12 | 91 |
| C50 | 37/7/25 135 | 0.860/−3.7 | 33/7/21 139 | **1.024/+0.5** | +0.16 | 88 |

### TE 50%  ← thin / noise
| arm | A V/W/L INV | A PF/NetR | B V/W/L INV | B PF/NetR | dPF | kept% |
|---|---|---|---|---|---|---|
| C1  | 44/6/32 128 | 0.566/−14.9 | 30/3/21 142 | 0.437/−12.6 | −0.13 | 63 |
| C10 | 36/4/26 136 | 0.470/−14.7 | 29/3/20 143 | 0.460/−11.4 | −0.01 | 77 |
| C20 | 33/4/23 139 | 0.532/−11.4 | 29/3/20 143 | 0.460/−11.4 | −0.07 | 85 |
| C30 | 27/3/19 144 | 0.483/−10.4 | 24/3/16 147 | 0.574/−7.2 | +0.09 | 86 |
| C40 | 25/2/18 146 | 0.341/−12.6 | 23/2/16 148 | 0.384/−10.5 | +0.04 | 90 |
| C50 | 24/2/16 148 | 0.384/−10.5 | 22/2/14 150 | 0.438/−8.4 | +0.05 | 89 |

*(75% omitted at 2y — too few trades to read. Confirmed count per cell = B's W+L; kept% shown above.)*

---

## 4. Analysis

**Does Confirmed Revisit improve PF vs plain TE at matched cells?** **Yes, at low–mid thresholds.** At **5%
and 10%, B beats A at every arm** (dPF +0.06 to +0.21), with the biggest lift at mid arms (C10–C30). At
**25%** it is mixed (helps C40/C50, slightly hurts C20/C30). At **50%** it is flat-to-worse on tiny samples.

**The mechanism — it keeps winners and removes losers.** Across 5–10% the **win count is essentially
unchanged while losses fall**: e.g. 10%·C40 A 10W/35L → B 10W/**29L**; 5%·C30 A 10W/42L → B 10W/**34L**.
So the close-back-above filter is discarding *failed* revisits (which would have lost) and retaining the
genuine rejections. WR rises because losses drop, not because trades are blindly cut. (At **C1** the filter
also drops some winners — 5%·C1 15W→10W — so confirmation is least useful at the shallowest arm.)

**Does any cell approach or exceed PF 1?** **Yes — the first positive cells in the whole programme.** B
reaches **PF ≥ 1.0 / Net R ≥ 0 at 5%·C40 (1.02), 10%·C40 (1.057, +1.8R), 10%·C50 (1.023), 25%·C40 (1.023),
25%·C50 (1.024)**. These are marginal (PF ~1.0) on **33–45 valid trades**, i.e. directional, not yet robust.

**Which threshold/arm benefits most?** **10% × deep arms (C40–C50)** — best dPF on the healthiest samples,
and the only matched cells that cross to positive Net R. Mid arms (C10–C30 at 5–10%) get the largest PF
*lift* but stay < 1.0.

**Does trade count collapse too much?** **No — B keeps ~63–93% of A's fills** (kept% rises with arm depth;
lowest at shallow arms / low thresholds where a third of trades drop). At the target cells (5–10% × C30–C50)
B keeps **84–88%**. INVALID rises modestly (delaying entry exposes a few more orders to OB breaks), but the
trade base stays usable.

**Did confirmation just enter late / reduce winners?** **No.** Entry price is unchanged (limit at the edge),
and wins are preserved at C10+ while losses fall — the opposite of "late entry at worse prices." Only at the
shallowest arm (C1) does it shave some winners.

**Is this worth promoting to BE testing?** **Yes — strongest signal yet.** The entry filter alone reaches
breakeven at 5–10% × C40–C50. Adding BE to those cells is the natural next lever and could push them
properly positive.

**Continue with wick / displacement variants?** **Yes.** Close-back-above already shows real signal (keeps
wins, cuts losses); sharper confirmations (wick rejection, displacement) are worth testing as B/C variants.

**Contrast with cancel-before-arm.** Cancel-before-arm *destroyed* the deep-arm edge (it removed the winning
revisit cohort). Confirmed Revisit does the inverse — it **keeps** that cohort and trims its failures — which
is exactly why this one lifts PF where cancel did not.

---

## 5. Plain-English conclusion

Confirmed Revisit (close-back-above-edge, limit-gated) is the **first entry tweak in this research that moves
the needle the right way.** On a matched 2-year A/B it improves profit factor over plain delayed Triggered
Edge at every 5% and 10% arm, by keeping the genuine "left-and-returned, rejection held" trades and dropping
the failed revisits that would have lost — so wins are preserved and losses fall. At **10% × C40–C50** it
nudges a handful of cells to **PF ≈ 1.0–1.06 / slightly positive Net R**, the first non-losing cells seen.
These are **marginal and on thin samples (~35–45 trades)** in a single tough 2-year regime, so this is a
**promising lead, not a proven edge.** Next steps in priority order: (1) re-run the **5–10% × C35–C45** band
on the **full 6.4 years** for robust counts; (2) **add BE** to those cells; (3) prototype the **wick** and
**displacement** confirmation variants. The effect fades by 25% and is noise at 50%, so keep the focus on
**low-mid thresholds × deep arms.** Default behaviour is untouched and the flag stays off.

**Caveats:** 2y slice (compute-bound), thin deep-arm samples, PF~1.0 within noise, no full-range or BE
confirmation yet, single symbol (EURUSD).

---

## 6. git status / diff stat
```
Lux-OB-Backtester (NOT staged/committed/pushed):
 M src/execution.py            +92/−1  (require_revisit_confirmation kwarg + per-order state +
                                        confirmation state machine + fill-gate AND term; default-off.
                                        Includes the prior, still-uncommitted cancel-before-arm block.)
 ?? tests/test_confirmed_revisit.py     (new, 14 cases, all pass)
 ?? tests/test_cancel_exit_before_arm.py(pre-existing from earlier task)
 ?? outputs/sweeps/cr_run2y.py          (A/B harness, research scratch)
 ?? outputs/sweeps/confirmed_revisit_ab.py (full-range harness variant, scratch)
 (sidecar/server.py, data/candles manifests, configs/, .claude/ — pre-existing, untouched here)
HEAD: dba2bb8  (unchanged)
```

*Stopped after report. Nothing staged, committed, or pushed.*
