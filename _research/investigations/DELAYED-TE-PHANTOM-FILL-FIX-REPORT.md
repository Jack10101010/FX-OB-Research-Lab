# Fix: Delayed Triggered-Edge Phantom Fills — Implementation Report

**Repo:** Lux-OB-Backtester. **Mode:** implement + validate. **Not staged / committed / pushed.**

## Root cause (recap)
The armed triggered-edge fill condition in `src/execution.py` used the **inverted** touch test, so a
delayed order filled whenever price was merely on the wrong side of the edge after the delay — at the
**stale OB-edge price**, not a real touch. Result: ~70% phantom fills; the entire apparent edge was an
artifact.

## Exact change

**Lines changed:** `src/execution.py` — the armed-TE touch sub-expression in **all four** fill/cancel
checks: **~2068** (news-touch-cancel), **~2102** & **~2120** (reverse-touch branches), **~2144** (main
fill). `git diff --stat`: **4 insertions(+), 4 deletions(−)**.

**Old (inverted) — armed-TE branch:**
```python
(candle["high"] >= _pm_entry if _pm_dir == "bullish" else candle["low"] <= _pm_entry)
   if (_pm_em == "triggered_edge" and item["triggered_edge_armed"]) else <normal limit>
```
**New (correct) — armed-TE branch now matches a real limit touch:**
```python
(candle["low"] <= _pm_entry if _pm_dir == "bullish" else candle["high"] >= _pm_entry)
   if (_pm_em == "triggered_edge" and item["triggered_edge_armed"]) else <normal limit>
```
So a delayed order fills only when price actually trades **through** the entry on/after the arm candle:
**bullish → `low <= entry`, bearish → `high >= entry`.** Unchanged: trigger detection, arm-eligibility
gate (`candle_index >= trigger_ci + trigger_delay_candles`), delay-window observational fields, BE,
TP/SL, scenario generation, and output schema.

## `armed_at` audit (Task 3)
`item["armed_at"] = candle["time"]` is set at the **trigger candle** (execution.py:2089), alongside
`armed_on_trigger_candle=True` / `armed_same_candle=True`. So **`armed_at` = trigger time** ("limit
placed"), while **`arm_candle_index` = trigger + delay** (fill-eligibility candle). These are two distinct
events sharing "arm" naming. Per instructions, **no schema change was made** in this patch (adding an
`arm_time`/`arm_eligible_time` column would touch `TRADE_COLUMNS` + the row emitter and risk
importer/parity surprises for a cosmetic marker). **Left for a separate follow-up**; documented here.

## Validation results

**Compile:** `py_compile src/execution.py` → OK. Inverted-condition occurrences after fix: **0**;
eligibility gate intact at all **4** sites.

**Synthetic harness** (new `tests/test_delayed_te_fill.py`, cases A–E) → **6 passed, 0 failed**:
| case | scenario | expected | result |
|---|---|---|---|
| A | bullish, delay 2, entry touched only *during* delay, never after arm | NO FILL | ✓ |
| B | bullish, delay 2, `low <= entry` after arm | FILL | ✓ |
| C | bearish, delay 2, entry touched only during delay | NO FILL | ✓ |
| D | bearish, delay 2, `high >= entry` after arm | FILL | ✓ |
| E1 | valid post-arm touch + same-candle TP | FILL + win | ✓ |
| E2 | no post-arm touch but TP in range | NO FILL (no phantom win) | ✓ |

Discrimination check: re-applying the **inverted** condition to an in-memory copy makes case A
(wrongly) fill — confirming the harness catches the bug, and the fix removes it.

**Real-run before/after** (run 86c11cdc, d50 / 10% threshold, delay 50; 18-month window 2020-01…2021-07,
556k candles, 71 OBs):
| | filled | **invalid fills** | net R | W / L |
|---|---|---|---|---|
| OLD (inverted) | 33 | **22 (67%)** | **+22.9** | 13 / 20 |
| **FIXED** | 33 | **0** | **−2.9** | 7 / 26 |

→ **invalid fills 22 → 0**; **net R +22.9 → −2.9** (edge eliminated, matching the audit's
+1,756 → −547 direction); 6 phantom wins removed (13→7). Same fill count means the phantom fills weren't
extra trades — they were the *same* orders filled at fictitious favorable prices; with correct fills they
mostly lose. (Full 6-year × all-thresholds re-run exceeds the sandbox's 45 s command cap; the windowed
slice is representative and conclusive — 0 invalid after fix.)

**Existing tests (non-delayed / BE behavior unchanged):**
- `tests/test_be_replay.py` → **74 passed, 0 failed**
- `tests/test_be_multiarm_inloop_active.py` → **102 passed, 0 failed**
- `src/retest_tracker_test.py` → **178 passed, 0 failed**

(Delay-0 triggered-edge is effectively unchanged: on the trigger/arm candle price straddles the edge, so
`low<=entry` and `high>=entry` both fire — which is why these suites are unaffected. As expected and per
the brief, **byte-parity with OLD *delayed* outputs does NOT hold** — that is the correctness fix, not a
regression.)

## Conclusions
- The inverted armed-TE fill test is fixed: delayed orders now require a genuine post-arm entry touch.
- Phantom fills go to **0** on real data; the apparent deep-delay edge disappears (turns net-negative),
  confirming the audit.
- BE, retest, multiarm, and non-delayed behavior are unchanged (all existing tests green).
- `armed_at` semantics documented; schema change deferred to a follow-up.

## git status / diff stat
```
Lux-OB-Backtester:
 M src/execution.py            | 8 ++++----  (4 insertions, 4 deletions)
 ?? tests/test_delayed_te_fill.py  (new, 140 lines)
 (M sidecar/server.py, data/candles/*_manifest.json — PRE-EXISTING from earlier tasks, NOT modified here)
```
No frontend, no sidecar, no run_backtest/config changes in this task.

*Stopped after validation. Not staged, committed, or pushed.*
