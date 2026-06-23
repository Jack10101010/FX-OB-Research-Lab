# Fix: Residual Delayed-Entry "Stale Top" Fills — Implementation Report

**Repo:** Lux-OB-Backtester. **Mode:** implement + validate. **Not staged / committed / pushed.**

## Context
The prior fix removed the edge-inflating phantom fills (entry *below* the candle), but a residual
conservative artifact remained: **25/82 delayed fills had entry *above* the fill candle's high** —
the order filled at the stale OB edge on the arm candle when price had crossed the entry *during* the
delay and stayed on the far side. The one-sided test (`low <= entry` bullish / `high >= entry`
bearish) was satisfied by a candle entirely on one side of the entry.

## Exact condition used
At all **4** armed triggered-edge fill/cancel sites (`src/execution.py` ~2068 news-touch-cancel,
~2102 / ~2120 reverse-touch, ~2144 main fill), the armed-TE touch test now requires the entry to lie
**inside the candle's range** (a real post-arm touch), direction-safe:

```python
# armed triggered-edge branch — was: (low<=entry if bullish else high>=entry)
candle["low"] <= _pm_entry <= candle["high"]
```
The non-triggered-edge limit branch is **unchanged** (`low<=entry` bullish / `high>=entry` bearish),
per scope. Trigger detection, delay eligibility (`candle_index >= trigger_ci + delay`), BE, TP/SL, and
the output schema are all unchanged. `git diff --stat`: **4 insertions(+), 4 deletions(−)**.

## Validation

**Compile:** `py_compile src/execution.py` → OK. In-range condition present at **4/4** sites;
one-sided armed-TE branch remaining: **0**; eligibility gate intact at **4/4**.

**Synthetic harness** (`tests/test_delayed_te_fill.py`, now 10 cases) → **10 passed, 0 failed**:
| case | scenario | expect | result |
|---|---|---|---|
| A–E | (prior) directional no-fill/fill + same-candle-TP-needs-valid-fill | — | ✓ (6/6) |
| **F-A** | bullish, entry touched during delay, **arm candle entirely below entry** | NO FILL | ✓ |
| **F-B** | bullish, **arm candle straddles entry** (low≤entry≤high) | FILL | ✓ |
| **F-C** | bearish, entry touched during delay, **arm candle entirely above entry** | NO FILL | ✓ |
| **F-D** | bearish, **arm candle straddles entry** | FILL | ✓ |

**Real-run re-validation** (run 86c11cdc, 2023-H1, arms C20–C50, 10% threshold):
| check | before (one-sided fix) | **after (in-range)** |
|---|---|---|
| fills **below** candle low | 0 | **0** ✅ |
| fills **above** candle high (the residual) | **25** | **0** ✅ |
| fills **outside** candle range (either) | 25 | **0** ✅ |
| fills **before arm** | 0 | **0** ✅ |
| `arm_ci == trigger_ci + delay` | 82/82 | **63/63** ✅ |
| impossible TP (`fill_low > TP`) | 0 | **0** ✅ |
| ordering `trigger ≤ arm ≤ fill ≤ exit` | 82/82 | **63/63** ✅ |
| same-candle fill+exit | 1 | **1** (legit stop) |
| filled trades | 82 | **63** |

→ **The residual 25/82 stale-top fills are eliminated (0).** The filled count drops 82 → 63: the
stale-top "fills" that never had a genuine in-range touch now either don't fill at all (price never
returned to the entry) or fill later at a real touch. **Every one of the 63 fills now has its entry
inside the fill candle's range.**

**Existing tests (non-delayed / BE behavior unchanged):**
- `tests/test_be_replay.py` → **74 passed, 0 failed**
- `tests/test_be_multiarm_inloop_active.py` → **102 passed, 0 failed**
- `src/retest_tracker_test.py` → **178 passed, 0 failed**

## Are the residual 25/82 eliminated? **Yes — 0 fills outside the candle range.**
Delayed triggered-edge fills now require price to genuinely trade *through* the entry level on or
after the arm candle. Combined with the prior direction fix, delayed-entry mechanics are now
physically correct across every invariant checked: 0 below-low, 0 above-high, 0 before-arm,
0 impossible-TP, exact arm timing, valid ordering.

## git status / diff stat
```
Lux-OB-Backtester:
 M src/execution.py              | 8 ++++----  (4 insertions, 4 deletions)
 ?? tests/test_delayed_te_fill.py  (extended to 10 cases, 180 lines)
 (M sidecar/server.py — PRE-EXISTING from earlier tasks, NOT modified here)
```
No frontend, sidecar, run_backtest, or config changes in this task.

*Stopped after validation. Not staged, committed, or pushed.*
