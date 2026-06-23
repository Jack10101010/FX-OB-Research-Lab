# Delayed-Entry Post-Fix Validation Study — Pre-Rerun Confidence Check

**Mode:** Audit only (no code changed). Engine: **FIXED** `src/execution.py`.
**Sample:** run 86c11cdc, **2023-H1** (6 months) — 185,836 1m candles, 30 OBs (all bullish),
arms **C20–C50** at the 10% threshold, delay 20–50. **82 filled trades** generated and re-validated.

---

## Verdict

**The dangerous, edge-inflating bug is fixed — but delayed-entry mechanics are NOT yet 100%
physically correct.** The original phantom (fills *below* the candle that fabricated wins) is **gone
(0)**, every structural invariant holds, and the spurious edge is eliminated. However, a **second,
milder artifact remains: ~30% of fills (25/82) record an entry *above* the fill candle's high** — the
order fills at the stale OB-edge on the arm candle when price crossed the entry *during* the delay and
stayed below. These are **conservative** (23 losses / 2 wins, −16.4R; they *penalize*, not inflate),
but they are still fills at a price the candle never traded.

**Recommendation: do NOT launch the full 6-year research rerun for final numbers yet.** A rerun now
would be free of the fake edge and directionally trustworthy, but for a clean "physically correct"
sign-off the residual fill-price/touch rule should be resolved (or explicitly accepted as a known
~3-pip conservative bias).

---

## 1. Invalid fills — proof

| invariant | result | expect |
|---|---|---|
| fills **below** candle low (bullish) — the original phantom | **0 / 82** | 0 ✅ |
| fills **before arm** (`fill_ci < arm_ci`) | **0 / 82** | 0 ✅ |
| `arm_ci == trigger_ci + delay` | **82 / 82** | all ✅ |
| index ordering `trigger ≤ arm ≤ fill ≤ exit` | **82 / 82** | all ✅ |
| impossible TP geometry (`fill_candle_low > TP`) | **0 / 82** | 0 ✅ |
| TP above entry / stop below entry (bullish) | **82 / 82 ok** | all ✅ |

The edge-inflating phantom class (OB-1146 type: entry below the candle, TP already passed,
instant win) is **fully eliminated**.

## 2. Fills outside candle range

| | count | net R | W/L |
|---|---|---|---|
| entry **within** `[low, high]` (physically valid) | **57 / 82** | +24.7 | 19 / 38 |
| entry **above** high (residual artifact) | **25 / 82** | −16.4 | 2 / 23 |
| entry **below** low (original phantom) | **0 / 82** | — | — |

**Characterisation of the 25 residual fills:** all fill on the **exact arm candle** (`fill_ci ==
arm_ci`); entry is **0.6–12.4 pips above the fill candle's high** (median **2.8 pips**). Mechanism:
the genuine entry-cross happened *during* the delay window (price dipped through the OB top while the
order was ineligible) and price was **still below the top at the arm candle**, so the fixed
`low <= entry` test is trivially satisfied by a candle entirely below entry → the order fills at the
**stale OB top**, above the candle. A real buy-limit would fill at the candle's actual (lower) price,
not the stale top — so the recorded entry/risk/RR are slightly off. Because it's a *worse* entry, it
biases results **downward** (conservative), the opposite of the original bug.

## 3. Impossible-TP geometry
**0** trades with `fill_candle_low > TP` (the OB-1146 signature). Every win's TP sits at or above the
fill candle, and TP/stop are consistent with entry and direction on all 82 trades.

## 4. Fills before arm
**0** — every fill occurs on or after `arm_ci = trigger_ci + delay`. Arm timing is exact (82/82).

## 5. Same-candle fill/exit analysis
**1 / 82** (vs **483** in the broken run). The single case (OB586 C20) is legitimate: entry 1.05421
lies inside its fill candle `[1.05373, 1.05484]` and the candle's low (1.05373) is below the stop
(1.05378) → a genuine same-candle stop-out (LOSS). The mass "fill-and-TP-in-one-minute" phantom-win
pattern is gone.

## 6. Visual lifecycle sample (24 of 82)
All sampled trades show a consistent chain `trigger# → arm# (=trigger+delay) → fill# (≥arm) → exit#
(≥fill)` and plausible stop/TP geometry. Representative rows:

```
[OK ] OB602 C20 trig#113526 arm#113546 fill#113576 exit#113597  entry 1.09421 cand[1.09418,1.09431] stop 1.09334 tp 1.09708  WIN +3.30R  (real revisit, fd=50)
[OK ] OB596 C20 trig#97487  arm#97507  fill#97582  exit#97841   entry 1.08857 cand[1.08853,1.08871] stop 1.08784 tp 1.09098  WIN +3.30R  (fd=95, late genuine touch)
[OK ] OB586 C20 trig#75352  arm#75372  fill#75372  exit#75372   entry 1.05421 cand[1.05373,1.05484] stop 1.05378 tp 1.05563  LOSS −1.00R (same-candle stop, legit)
[ABV] OB564 C20 trig#25105  arm#25125  fill#25125  exit#25326   entry 1.08618 cand[1.08572,1.08591] ...                       WIN +3.30R  entry +2.7p ABOVE high (residual)
[ABV] OB607 C20 trig#122571 arm#122591 fill#122591 exit#122608  entry 1.09848 cand[1.09802,1.09820] ...                       LOSS −1.00R entry +2.8p ABOVE high (residual)
```
The `[OK]` set (57 trades) is fully consistent. The `[ABV]` set (25 trades) shows the residual: the
fill candle sits a few pips below the recorded entry.

## Confidence assessment & recommendation

- **Edge integrity restored:** the fabricated deep-delay edge is gone — sample net R is now slightly
  positive overall (+8.3R) and the valid-only subset is mixed (19W/38L), matching the audit's
  "valid-only is not a real edge."
- **Structural correctness:** arm timing, ordering, before-arm, impossible-TP, and same-candle are all
  clean.
- **Remaining gap:** ~30% of fills still record an entry above the fill candle (stale-OB-top fill when
  price gapped/sat below entry across the delay). It is conservative (~3-pip median, net −16.4R), so a
  rerun would **not** manufacture edge — but it is not strictly physical.

**Before the six-year rerun:** decide the intended delayed-entry fill rule for the "price already
below entry at the arm candle" case — e.g. (a) fill at the candle's actual price (`min(entry,
fill_candle_open/high)`) rather than the stale entry, or (b) require `low <= entry <= high` (a true
touch) on the fill candle, or (c) explicitly accept the ~3-pip conservative bias. Until then, treat
delayed-entry numbers as **trustworthy in direction (no fake edge) but ~3-pip pessimistic on ~30% of
fills** — fine for exploratory reruns, not yet for final published research figures.

*No code was changed. Audit/validation study only. Sample dataset written to
`outputs/_delayfix_validation_2023H1.csv` (scratch).*
